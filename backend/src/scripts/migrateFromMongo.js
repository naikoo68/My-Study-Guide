// ---------------------------------------------------------------------------
// One-time data importer: copies ALL documents from an existing MongoDB
// database into DynamoDB, preserving every id and reference.
//
// RESUMABLE + CHECKPOINTED (built for weak free-tier servers)
// -----------------------------------------------------------
// A big import (57k+ questions) can exceed a free instance's memory/CPU and get
// restarted mid-way. To survive that, this importer:
//   • Clears the DynamoDB tables ONCE (guarded by a progress record), NOT on
//     every restart — so data is never repeatedly wiped.
//   • Imports each collection in small CHUNKS and saves a CHECKPOINT after each
//     chunk (collection name + how many docs done).
//   • On restart it RESUMES from the checkpoint instead of starting over.
//   • Marks itself "done" when finished, so it never clears/re-imports again.
//
// Progress is stored in a dedicated DynamoDB table (msg_MigrationState), one
// record with _id="mongo-import".
//
// Usage:
//   • Standalone:  MONGO_URI="<uri>" npm run migrate-from-mongo   (loops to done)
//   • On startup:  RUN_MONGO_MIGRATION=true + MONGO_URI + DB_ENGINE=dynamo
//                  (each boot does one time-boxed pass; leave the flag on until
//                   the logs say "import complete", then remove it)
// ---------------------------------------------------------------------------

import { MongoClient } from "mongodb";
import { GetCommand, PutCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "../config/dynamo.js";
import { ensureTables } from "../db/createTables.js";
import "../models/index.js";
import { allModels } from "../db/odm.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const CHUNK = 100;                 // docs written per checkpoint (keeps memory + progress small)
const STATE_TABLE = tableName("MigrationState");
const STATE_ID = "mongo-import";

// ---- progress record helpers ----
async function loadState() {
  const { Item } = await ddb.send(new GetCommand({ TableName: STATE_TABLE, Key: { _id: STATE_ID } }));
  return Item || null;
}
async function saveState(state) {
  await ddb.send(new PutCommand({ TableName: STATE_TABLE, Item: { _id: STATE_ID, ...state } }));
}

function convert(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map(convert);
    if (Buffer.isBuffer?.(value)) return value.toString("base64");
    const out = {};
    for (const [k, v] of Object.entries(value)) { if (k === "__v") continue; out[k] = convert(v); }
    return out;
  }
  return value;
}

function matchModel(collectionName, models) {
  const c = normalize(collectionName);
  let best = null, bestLen = -1;
  for (const m of models) {
    const n = normalize(m.modelName);
    if (c.startsWith(n) && n.length > bestLen) { best = m; bestLen = n.length; }
  }
  return best;
}

async function writeBatch(model, docs) {
  for (let i = 0; i < docs.length; i += 25) {
    let items = docs.slice(i, i + 25).map((d) => ({ PutRequest: { Item: model._prepForWrite(d) } }));
    let attempt = 0;
    while (items.length) {
      // eslint-disable-next-line no-await-in-loop
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [model.tableName]: items } }));
      const un = res.UnprocessedItems?.[model.tableName] || [];
      if (!un.length) break;
      attempt += 1;
      if (attempt > 8) throw new Error(`Too many unprocessed writes for ${model.modelName}`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(200 * attempt);
      items = un;
    }
  }
}

// Import ONE collection using _id-RANGE slices (not skip/sort of the whole
// collection). Each slice fetches only the next CHUNK docs whose _id > the last
// one we imported, writes them, and saves a checkpoint (the last _id + count).
// This is cheap even on a huge collection and a weak server: no growing skip, no
// full sort scan — each pass reliably makes progress and resumes exactly.
async function importCollection(db, job, state, deadline) {
  const coll = db.collection(job.name);
  const modelName = job.model.modelName;
  const p = state.progress[modelName] || { done: 0, afterId: null };
  let done = typeof p === "number" ? p : (p.done || 0);
  let afterId = typeof p === "number" ? null : (p.afterId || null);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = afterId ? { _id: { $gt: afterId } } : {};
    // Small, bounded fetch: only CHUNK docs, ordered by _id.
    // eslint-disable-next-line no-await-in-loop
    const rows = await coll.find(query, { sort: { _id: 1 }, limit: CHUNK }).toArray();
    if (!rows.length) break; // collection fully imported

    // eslint-disable-next-line no-await-in-loop
    await writeBatch(job.model, rows.map(convert));
    done += rows.length;
    afterId = rows[rows.length - 1]._id; // Mongo _id of the last written doc
    state.progress[modelName] = { done, afterId: String(afterId) };
    // eslint-disable-next-line no-await-in-loop
    await saveState(state);
    if (global.gc) global.gc();

    if (rows.length < CHUNK) break;            // last (partial) slice done
    if (Date.now() > deadline) return { done, finished: false }; // pass time up — resume next boot
  }
  return { done, finished: true };
}

// Run ONE time-boxed pass. Returns true when the whole migration is complete.
// maxMs limits how long a single pass runs, so a boot never hangs forever
// (0 = run until complete, used by the standalone CLI loop).
export async function migrateFromMongo(uri, { maxMs = 0, reset = false } = {}) {
  if (!uri) throw new Error("MONGO_URI is not set — nothing to import from.");
  await ensureTables();
  const models = allModels();

  // Optional clean start: forget any previous progress so the import re-plans,
  // clears once, and re-imports from scratch. Triggered by RESET_MIGRATION=true
  // (used after failed/partial earlier runs left a stale MigrationState).
  const wantReset = reset || process.env.RESET_MIGRATION === "true";
  let state = await loadState();
  if (wantReset && state) {
    console.log("↺ RESET_MIGRATION — discarding previous import progress and starting fresh.");
    await saveState({ phase: "", plan: null, progress: {}, resetAt: new Date().toISOString() });
    state = null;
  }

  if (state?.phase === "done") {
    console.log("✔ Import already completed earlier — nothing to do.");
    return { complete: true, imported: state.progress || {} };
  }

  const client = new MongoClient(uri);
  await client.connect();
  console.log("✔ Connected to source MongoDB.");
  const deadline = maxMs > 0 ? Date.now() + maxMs : Number.MAX_SAFE_INTEGER;

  try {
    const db = client.db();

    // Build (or reuse) the plan of collections -> models with counts.
    if (!state || !state.plan) {
      const collections = (await db.listCollections().toArray())
        .map((c) => c.name).filter((n) => !n.startsWith("system."));
      const plan = [];
      const used = new Set();
      let total = 0;
      for (const name of collections) {
        const model = matchModel(name, models);
        if (!model || used.has(model.modelName)) continue;
        used.add(model.modelName);
        // eslint-disable-next-line no-await-in-loop
        const count = await db.collection(name).countDocuments();
        plan.push({ name, model: model.modelName, count });
        total += count;
        console.log(`  • Found ${count} in "${name}" → ${model.modelName}`);
      }
      if (!plan.length || total === 0) {
        throw new Error("No matching data found in the source MongoDB — aborting without changing anything. Check MONGO_URI (including the database name).");
      }
      state = { phase: "clearing", plan, progress: {}, startedAt: new Date().toISOString() };
      await saveState(state);
    }

    // Clear ALL tables ONCE (only in the "clearing" phase). A restart during
    // importing will NOT re-clear, so imported data is preserved.
    if (state.phase === "clearing") {
      for (const model of models) {
        if (model.tableName === STATE_TABLE) continue; // never clear our own progress
        // eslint-disable-next-line no-await-in-loop
        await model._clearAll();
      }
      console.log(`✔ Cleared DynamoDB tables once (removed sample/placeholder data).`);
      state.phase = "importing";
      await saveState(state);
    }

    // Import each collection, resuming from the saved checkpoint.
    const modelByName = Object.fromEntries(models.map((m) => [m.modelName, m]));
    const doneCount = (v) => (typeof v === "number" ? v : (v && v.done) || 0);
    for (const job of state.plan) {
      const already = doneCount(state.progress[job.model]);
      if (already >= job.count) continue; // this collection is finished
      const model = modelByName[job.model];
      console.log(`  → Importing ${job.model} (${already}/${job.count} done)…`);
      // eslint-disable-next-line no-await-in-loop
      const r = await importCollection(db, { name: job.name, model }, state, deadline);
      console.log(`    ${job.model}: ${r.done}/${job.count}`);
      if (!r.finished && Date.now() > deadline) {
        console.log("⏸ Pass time limit reached — progress saved; will resume on next run.");
        const counts = Object.fromEntries(Object.entries(state.progress).map(([k, v]) => [k, doneCount(v)]));
        return { complete: false, imported: counts };
      }
    }

    // All collections done.
    state.phase = "done";
    state.finishedAt = new Date().toISOString();
    await saveState(state);
    const counts = Object.fromEntries(Object.entries(state.progress).map(([k, v]) => [k, doneCount(v)]));
    console.log("✅ MongoDB → DynamoDB import complete.", JSON.stringify(counts));
    return { complete: true, imported: counts };
  } finally {
    await client.close();
  }
}

// Standalone CLI: loop passes until complete (no time box).
const isDirect = process.argv[1] && process.argv[1].endsWith("migrateFromMongo.js");
if (isDirect) {
  (async () => {
    try {
      await import("dotenv/config");
      let res = { complete: false };
      while (!res.complete) {
        // eslint-disable-next-line no-await-in-loop
        res = await migrateFromMongo(process.env.MONGO_URI);
      }
      console.log("\n✅ Done. Imported:", res.imported);
      process.exit(0);
    } catch (e) {
      console.error("\n✖ Migration failed:", e.message);
      process.exit(1);
    }
  })();
}
