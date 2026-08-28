// ---------------------------------------------------------------------------
// One-time data importer: copies ALL documents from an existing MongoDB
// database into the new DynamoDB tables, preserving every id and reference so
// relationships stay intact.
//
// LOW-MEMORY design (works on tiny free-tier servers, even with 50k+ rows):
//   • Reads each collection with a CURSOR in small batches and writes each
//     batch to DynamoDB immediately, so only a few hundred docs are ever in
//     memory at once (never the whole collection).
//   • Uses a small batchSize and nudges the garbage collector between batches.
//
// SAFE:
//   • First it connects and confirms at least one matching collection is
//     non-empty; only THEN does it clear the DynamoDB tables. If MongoDB is
//     unreachable or nothing matches, it aborts and changes nothing.
//   • Preserves each document's original _id (as a string), so re-running just
//     overwrites the same rows (no duplicates).
//
// Usage:
//   • Standalone:  MONGO_URI="<old-uri>" npm run migrate-from-mongo
//   • On startup:  set RUN_MONGO_MIGRATION=true, MONGO_URI, DB_ENGINE=dynamo.
// ---------------------------------------------------------------------------

import { MongoClient } from "mongodb";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../config/dynamo.js";
import { ensureTables } from "../db/createTables.js";
import "../models/index.js";
import { allModels } from "../db/odm.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const READ_BATCH = 200; // docs pulled from Mongo per round (keeps memory low)

// Recursively convert Mongo values into plain JSON:
//   • ObjectId  -> its hex string (so ids/refs become consistent strings)
//   • Date      -> left as Date (serialize() turns it into an ISO string)
//   • drops Mongoose's internal __v field
function convert(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString(); // ObjectId
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map(convert);
    if (Buffer.isBuffer?.(value)) return value.toString("base64");
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "__v") continue;
      out[k] = convert(v);
    }
    return out;
  }
  return value;
}

// Match a MongoDB collection name to one of our models using longest-prefix
// matching (so "examposts" -> ExamPost not Exam, "testseries" -> TestSeries…).
function matchModel(collectionName, models) {
  const c = normalize(collectionName);
  let best = null;
  let bestLen = -1;
  for (const m of models) {
    const n = normalize(m.modelName);
    if (c.startsWith(n) && n.length > bestLen) { best = m; bestLen = n.length; }
  }
  return best;
}

// Write up to 25 items (one DynamoDB BatchWrite), retrying any unprocessed.
async function writeBatch(model, docs) {
  for (let i = 0; i < docs.length; i += 25) {
    // _prepForWrite drops null/empty indexed keys so DynamoDB won't reject the
    // write with "Type mismatch ... Expected: S Actual: NULL" on a GSI field.
    let items = docs.slice(i, i + 25).map((d) => ({ PutRequest: { Item: model._prepForWrite(d) } }));
    let attempt = 0;
    while (items.length) {
      // eslint-disable-next-line no-await-in-loop
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [model.tableName]: items } }));
      const unprocessed = res.UnprocessedItems?.[model.tableName] || [];
      if (!unprocessed.length) break;
      attempt += 1;
      if (attempt > 8) throw new Error(`Too many unprocessed writes for ${model.modelName}`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(200 * attempt);
      items = unprocessed;
    }
  }
}

async function clearTable(model) {
  // Low-memory clear: delete page-by-page instead of loading the whole table.
  await model._clearAll();
}

// Stream one collection into its DynamoDB table in small batches. Returns count.
async function streamCollection(db, name, model) {
  const cursor = db.collection(name).find({}, { batchSize: READ_BATCH });
  let buffer = [];
  let total = 0;
  // Iterate the cursor doc-by-doc; flush every READ_BATCH so memory stays flat.
  // eslint-disable-next-line no-restricted-syntax
  for await (const doc of cursor) {
    buffer.push(convert(doc));
    if (buffer.length >= READ_BATCH) {
      await writeBatch(model, buffer);
      total += buffer.length;
      buffer = [];
      if (global.gc) global.gc(); // release memory if node was started with --expose-gc
    }
  }
  if (buffer.length) { await writeBatch(model, buffer); total += buffer.length; buffer = []; }
  return total;
}

export async function migrateFromMongo(uri) {
  if (!uri) throw new Error("MONGO_URI is not set — nothing to import from.");

  await ensureTables();
  const models = allModels();

  const client = new MongoClient(uri);
  await client.connect();
  console.log("✔ Connected to source MongoDB.");

  const summary = { imported: {}, skippedCollections: [] };

  try {
    const db = client.db(); // database name comes from the URI
    const collections = (await db.listCollections().toArray())
      .map((c) => c.name)
      .filter((n) => !n.startsWith("system."));

    // 1) Map collections -> models (no data loaded yet — just plan + counts).
    const jobs = [];
    const usedModels = new Set();
    let totalDocs = 0;
    for (const name of collections) {
      const model = matchModel(name, models);
      if (!model) { summary.skippedCollections.push(name); continue; }
      if (usedModels.has(model)) { summary.skippedCollections.push(`${name} (already mapped to ${model.modelName})`); continue; }
      usedModels.add(model);
      // eslint-disable-next-line no-await-in-loop
      const count = await db.collection(name).countDocuments();
      jobs.push({ name, model, count });
      totalDocs += count;
      console.log(`  • Found ${count} document(s) in "${name}" → ${model.modelName}`);
    }

    // SAFETY: abort (change nothing) if nothing matched or everything is empty —
    // protects against a wrong/empty connection string wiping DynamoDB data.
    if (!jobs.length || totalDocs === 0) {
      throw new Error(
        "No matching data found in the source MongoDB — aborting without changing anything. " +
        "Double-check your MONGO_URI (including the database name at the end)."
      );
    }

    // 2) Safe to replace: clear DynamoDB tables (removes sample/placeholder data).
    for (const model of models) {
      // eslint-disable-next-line no-await-in-loop
      await clearTable(model);
    }
    console.log(`✔ Cleared ${models.length} DynamoDB table(s) (removed sample/placeholder data).`);

    // 3) Stream each collection across in small batches (low memory).
    for (const job of jobs) {
      // eslint-disable-next-line no-await-in-loop
      const n = await streamCollection(db, job.name, job.model);
      summary.imported[job.model.modelName] = n;
      console.log(`  ✔ Imported ${n} → ${job.model.modelName}`);
    }
  } finally {
    await client.close();
  }

  console.log("✅ MongoDB → DynamoDB import complete.", JSON.stringify(summary.imported));
  if (summary.skippedCollections.length) {
    console.log("ℹ Collections with no matching model (skipped):", summary.skippedCollections.join(", "));
  }
  return summary;
}

// Allow running directly: `npm run migrate-from-mongo`
const isDirect = process.argv[1] && process.argv[1].endsWith("migrateFromMongo.js");
if (isDirect) {
  (async () => {
    try {
      await import("dotenv/config");
      const summary = await migrateFromMongo(process.env.MONGO_URI);
      console.log("\n✅ Done. Imported:", summary.imported);
      process.exit(0);
    } catch (e) {
      console.error("\n✖ Migration failed:", e.message);
      process.exit(1);
    }
  })();
}
