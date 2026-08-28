// ---------------------------------------------------------------------------
// Database engine SELECTOR.
//
// One codebase, two databases — chosen at startup by the DB_ENGINE env var:
//
//   DB_ENGINE=dynamo   -> AWS DynamoDB (via the compatibility ODM)
//   DB_ENGINE=mongo    -> MongoDB (real Mongoose)   [default when unset]
//
// Every model does `import mongoose from "../db/odm.js"` and uses the
// mongoose‑style API (Schema, model, Schema.Types, connection, plugin…). Both
// engines expose that same surface, so the models don't care which is active.
//
// To switch databases: change DB_ENGINE (and the matching connection settings —
// MONGO_URI for mongo, or AWS_* for dynamo) and redeploy. No code changes.
// ---------------------------------------------------------------------------

const ENGINE = (process.env.DB_ENGINE || "mongo").toLowerCase();

let _default;
let _allModels;

if (ENGINE === "dynamo") {
  // DynamoDB compatibility engine (only loaded in dynamo mode, so AWS SDK /
  // table client are never initialised when running on MongoDB).
  const engine = await import("./dynamoEngine.js");
  _default = engine.default;
  _allModels = engine.allModels;
  console.log("🗄  DB_ENGINE=dynamo — using AWS DynamoDB.");
} else {
  // Real Mongoose / MongoDB.
  const mongoose = (await import("mongoose")).default;
  _default = mongoose;
  _allModels = () => Object.values(mongoose.models || {});
  console.log("🗄  DB_ENGINE=mongo — using MongoDB (Mongoose).");
}

// Default export = the mongoose-style object the models use.
export default _default;

// Named export used by createTables.js / migrateFromMongo.js (dynamo paths).
export const allModels = _allModels;

// Convenience re-exports (mirror mongoose so any `import { Schema } from` works).
export const Schema = _default.Schema;
export const model = typeof _default.model === "function" ? _default.model.bind(_default) : _default.model;
export const Types = _default.Schema ? _default.Schema.Types : undefined;
export const connection = _default.connection;
export const ENGINE_NAME = ENGINE;
