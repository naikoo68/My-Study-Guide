// ---------------------------------------------------------------------------
// One-time data importer: copies ALL collections from an existing MongoDB into
// the CURRENT Mongoose-backed database. Its main use is loading your data into
// Oracle Autonomous Database (reached via the MongoDB API on DB_ENGINE=oracle),
// but it works for any Mongoose target.
//
// Mirrors the Mongo→Dynamo importer's design:
//   • RESUMABLE + CHECKPOINTED — imports each collection in small _id-range
//     slices and saves progress (in a `_mongoImportState` doc in the TARGET),
//     so a restart resumes instead of restarting.
//   • Clears the target collections ONCE (guarded) to drop any sample/seed
//     data, then imports. It NEVER touches the source MongoDB.
//   • Time-boxed per pass so a small/weak host still makes progress
//     across restarts.
//   • Preserves every _id and reference (raw document copy).
//
// Usage:
//   • On startup:  RUN_ORACLE_IMPORT=true + DB_ENGINE=oracle + ORACLE_MONGO_URI
//                  + SOURCE_MONGO_URI (or MONGO_URI = your OLD MongoDB).
//                  Leave the flag on until the logs say "import complete", then
//                  remove it.
//   • Standalone:  DB_ENGINE=oracle ORACLE_MONGO_URI=... SOURCE_MONGO_URI=... \
//                  node src/scripts/importFromMongo.js   (loops to completion)
// ---------------------------------------------------------------------------

import { MongoClient, ObjectId } from "mongodb";
import mongoose from "../db/odm.js";

const CHUNK = Number(process.env.MIGRATION_CHUNK) || 200; // docs per checkpoint
const STATE_COLL = "_mongoImportState";
const STATE_ID = "mongo-to-current";
const DEBUG = process.env.MIGRATION_DEBUG === "true";

// Rebuild an ObjectId from a 24-char hex checkpoint so the { _id: { $gt } }
// resume query isn't broken by MongoDB's type-bracketing (comparison operators
// only match values of the SAME BSON type — a string $gt would match zero
// ObjectId _ids and stall the import). Non-ObjectId string ids pass through.
function resumeId(v) {
  if (v instanceof ObjectId) return v;
  if (typeof v === "string" && /^[a-fA-F0-9]{24}$/.test(v)) return new ObjectId(v);
  return v;
}

// Is this a duplicate-key / unique-constraint error? (Oracle's MongoDB API may
// phrase it differently from MongoDB, so we check code, writeErrors, AND text.)
function isDupKey(err) {
  if (!err) return false;
  if (err.code === 11000) return true;
  const msg = String(err.message || "");
  if (/duplicate key|E11000|unique constraint|ORA-00001/i.test(msg)) return true;
  const we = err.writeErrors || err.result?.writeErrors || err.result?.result?.writeErrors;
  return Array.isArray(we) && we.length > 0 && we.every((e) => (e.code ?? e.err?.code) === 11000);
}

// The conflicting {field: value} from a duplicate-key error, if the driver
// exposes it (used to remove the doc that's squatting on the unique value).
function dupKeyValue(err) {
  if (err?.keyValue && typeof err.keyValue === "object") return err.keyValue;
  const we = err?.writeErrors || err?.result?.writeErrors;
  if (Array.isArray(we)) {
    for (const e of we) {
      const kv = e.keyValue || e.err?.keyValue;
      if (kv && typeof kv === "object") return kv;
    }
  }
  return null;
}

const allNullish = (kv) => Object.values(kv || {}).every((v) => v === null || v === undefined || v === "");

// Insert a batch so the SOURCE always wins. A plain insert silently DROPS any
// document that collides with a target unique index (this is what lost your
// real settings doc, plus a couple of users/tests). Here, on a unique conflict
// we remove the doc squatting on that unique value and insert the source one.
async function insertSourceWins(dst, rows, tally) {
  try {
    await dst.insertMany(rows, { ordered: false });
    tally.inserted += rows.length;
    return;
  } catch (err) {
    if (!isDupKey(err)) throw err; // a real (non-duplicate) error — surface it
  }
  // Some docs collided — retry each one idempotently (already-inserted ones are
  // just replaced by _id; genuinely conflicting ones are recovered).
  for (const doc of rows) {
    // eslint-disable-next-line no-await-in-loop
    await upsertSourceWins(dst, doc, tally);
  }
}

async function upsertSourceWins(dst, doc, tally) {
  let firstErr;
  try {
    await dst.insertOne(doc);
    tally.inserted += 1;
    return;
  } catch (err) {
    if (!isDupKey(err)) throw err;
    firstErr = err;
  }
  // Duplicate. Make the SOURCE document win: delete whatever target doc holds
  // the conflicting unique value (and any doc already using our _id), then insert.
  const kv = dupKeyValue(firstErr);
  try {
    if (kv && !allNullish(kv)) await dst.deleteMany(kv);
    await dst.deleteOne({ _id: doc._id });
    await dst.insertOne(doc);
    tally.recovered += 1;
  } catch (err2) {
    if (isDupKey(err2)) {
      // Can't safely resolve (e.g. several source docs share a NULL unique
      // field, or the driver didn't tell us which key clashed). Leave it out
      // and count it so the summary is honest.
      tally.skipped += 1;
    } else {
      throw err2;
    }
  }
}

// The TARGET is the app's current Mongoose connection (Oracle on
// DB_ENGINE=oracle, or MongoDB on DB_ENGINE=mongo).
function targetDb() {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("No active Mongoose connection — the target database isn't connected yet.");
  return db;
}

async function loadState() {
  return targetDb().collection(STATE_COLL).findOne({ _id: STATE_ID });
}
async function saveState(state) {
  await targetDb()
    .collection(STATE_COLL)
    .replaceOne({ _id: STATE_ID }, { _id: STATE_ID, ...state }, { upsert: true });
}

const doneOf = (v) => (typeof v === "number" ? v : (v && v.done) || 0);
const summarize = (state) =>
  Object.fromEntries(Object.entries(state.progress || {}).map(([k, v]) => [k, doneOf(v)]));

// Import ONE collection using _id-range slices (cheap + resumable). Each slice
// fetches the next CHUNK docs whose _id > the last imported one, writes them,
// and checkpoints. Never treats a short batch as "done" — only an empty cursor
// or reaching the expected count finishes the collection.
async function importCollection(sourceDb, job, state, deadline, tally) {
  const src = sourceDb.collection(job.name);
  const dst = targetDb().collection(job.name);
  const p = state.progress[job.name] || { done: 0, afterId: null };
  let done = doneOf(p);
  let afterId = typeof p === "number" ? null : p.afterId || null;
  const expected = job.count;

  let slice = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    slice += 1;
    const query = afterId ? { _id: { $gt: resumeId(afterId) } } : {};
    // eslint-disable-next-line no-await-in-loop
    const rows = await src.find(query).sort({ _id: 1 }).limit(CHUNK).toArray();
    if (!rows.length) return { done, finished: done >= expected };

    // eslint-disable-next-line no-await-in-loop
    await insertSourceWins(dst, rows, tally);

    done += rows.length;
    afterId = rows[rows.length - 1]._id;
    state.progress[job.name] = { done, afterId: String(afterId) };
    // eslint-disable-next-line no-await-in-loop
    await saveState(state);
    if (DEBUG) console.log(`      [${job.name}] slice#${slice}: +${rows.length} -> ${done}/${expected}`);
    if (global.gc) global.gc();

    if (done >= expected) return { done, finished: true };
    if (Date.now() > deadline) return { done, finished: false };
  }
}

// Run ONE time-boxed pass. Returns { complete } — true when everything is done.
// maxMs = 0 means run until complete (used by the standalone CLI).
export async function importFromMongo({ maxMs = 0, reset = false } = {}) {
  const sourceUri = process.env.SOURCE_MONGO_URI || process.env.MONGO_URI;
  if (!sourceUri) throw new Error("SOURCE_MONGO_URI (or MONGO_URI) is not set — nothing to import from.");
  targetDb(); // ensure the target engine is connected

  const wantReset = reset || process.env.RESET_IMPORT === "true";
  let state = await loadState();
  if (wantReset && state) {
    console.log("↺ RESET_IMPORT — discarding previous import progress and starting fresh.");
    await targetDb().collection(STATE_COLL).deleteOne({ _id: STATE_ID });
    state = null;
  }
  if (state?.phase === "done") {
    console.log("✔ Import already completed earlier — nothing to do.");
    return { complete: true, imported: summarize(state) };
  }

  const client = new MongoClient(sourceUri, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 120000,
    connectTimeoutMS: 15000,
    maxPoolSize: 3,
  });
  await client.connect();
  console.log("✔ Connected to source MongoDB.");
  const deadline = maxMs > 0 ? Date.now() + maxMs : Number.MAX_SAFE_INTEGER;
  const tally = { inserted: 0, recovered: 0, skipped: 0 };

  try {
    const sourceDb = client.db();

    // Build (or reuse) the plan: source collections + their counts.
    if (!state || !state.plan) {
      // Optional: restrict the import to specific collections via IMPORT_ONLY
      // (comma-separated names, e.g. "settings,users,testseries"). Handy to
      // RECOVER just a few dropped collections without re-copying the huge ones
      // (e.g. questions). Only these collections are cleared + imported; every
      // other collection is left completely untouched.
      const only = (process.env.IMPORT_ONLY || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const names = (await sourceDb.listCollections().toArray())
        .map((c) => c.name)
        .filter((n) => !n.startsWith("system.") && n !== STATE_COLL)
        .filter((n) => !only.length || only.includes(n.toLowerCase()));
      if (only.length) console.log(`  • IMPORT_ONLY is set — importing just: ${names.join(", ") || "(no matching collections)"}`);
      const plan = [];
      let total = 0;
      for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        const count = await sourceDb.collection(name).countDocuments();
        plan.push({ name, count });
        total += count;
        console.log(`  • Found ${count} in "${name}"`);
      }
      if (!plan.length || total === 0) {
        throw new Error("No data found in the source MongoDB — aborting without changing anything. Check SOURCE_MONGO_URI (including the database name).");
      }
      state = { phase: "clearing", plan, progress: {}, startedAt: new Date().toISOString() };
      await saveState(state);
    }

    // Clear the target collections ONCE (drop sample/seed data). Guarded by the
    // "clearing" phase so a restart never re-clears imported data. The SOURCE is
    // never touched.
    if (state.phase === "clearing") {
      for (const job of state.plan) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await targetDb().collection(job.name).deleteMany({});
        } catch (e) {
          if (DEBUG) console.log(`   (clear ${job.name} skipped: ${e.message})`);
        }
      }
      console.log("✔ Cleared target collections once (removed any sample/seed data).");
      state.phase = "importing";
      await saveState(state);
    }

    // Import each collection, resuming from its checkpoint.
    for (const job of state.plan) {
      if (doneOf(state.progress[job.name]) >= job.count) continue; // finished
      console.log(`  → Importing ${job.name} (${doneOf(state.progress[job.name])}/${job.count})…`);
      // eslint-disable-next-line no-await-in-loop
      const r = await importCollection(sourceDb, job, state, deadline, tally);
      console.log(`    ${job.name}: ${r.done}/${job.count}`);
      if (!r.finished && Date.now() > deadline) {
        console.log("⏸ Pass time limit reached — progress saved; will resume on next run.");
        return { complete: false, imported: summarize(state) };
      }
    }

    // Only finish when EVERY collection reached its expected count.
    const shortfalls = state.plan.filter((j) => doneOf(state.progress[j.name]) < j.count);
    if (shortfalls.length) {
      console.log(
        "↩ Not fully done yet — remaining:",
        shortfalls.map((j) => `${j.name} ${doneOf(state.progress[j.name])}/${j.count}`).join(", ")
      );
      return { complete: false, imported: summarize(state) };
    }

    state.phase = "done";
    state.finishedAt = new Date().toISOString();
    await saveState(state);
    console.log("✅ MongoDB → current database import complete.", JSON.stringify(summarize(state)));
    console.log(`   Writes: inserted ${tally.inserted}, recovered ${tally.recovered} (overwrote conflicts), skipped ${tally.skipped}.`);
    if (tally.skipped > 0) {
      console.log(`   ⚠ ${tally.skipped} document(s) couldn't be inserted (unique-index clash on a null/unknown field) — the only records not copied.`);
    }
    return { complete: true, imported: summarize(state), tally };
  } finally {
    await client.close();
  }
}

// Standalone CLI: connect the current engine, then loop passes until complete
// (no time box). Handy to finish the import in one run from your own machine.
const isDirect = process.argv[1] && process.argv[1].endsWith("importFromMongo.js");
if (isDirect) {
  (async () => {
    try {
      await import("dotenv/config");
      const { default: connectDB } = await import("../config/db.js");
      await connectDB();
      let res = { complete: false };
      while (!res.complete) {
        // eslint-disable-next-line no-await-in-loop
        res = await importFromMongo({});
      }
      console.log("\n✅ Done. Imported:", res.imported);
      process.exit(0);
    } catch (e) {
      console.error("\n✖ Import failed:", e.message);
      process.exit(1);
    }
  })();
}
