import mongoose from "../db/odm.js";
import tenantIdPlugin from "../models/plugins/tenantId.js";
import softDeleteFieldsPlugin from "../models/plugins/softDeleteFields.js";

// Register global plugins BEFORE any model schema is compiled, so every model
// gets the shared paths. This module MUST be imported ahead of the first model
// import in every entry point (server.js and any migration/seed script).
// Importing it for its side effect is enough.
//   • tenantIdPlugin      — adds `tenantId` to every model (multi-tenancy).
//   • softDeleteFieldsPlugin — adds `deleted`/`deletedAt` so any delete can be
//                              routed through the site-wide Recycle Bin.
mongoose.plugin(tenantIdPlugin);
mongoose.plugin(softDeleteFieldsPlugin);
