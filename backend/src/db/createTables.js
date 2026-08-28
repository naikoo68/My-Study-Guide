// Creates one on-demand (pay-per-request) DynamoDB table per model, keyed by
// `_id`, and provisions Global Secondary Indexes (GSIs) for the hot lookup
// fields declared in db/indexes.js. Idempotent: existing tables/indexes are
// left as-is; missing GSIs are added to existing tables. Safe to run every boot
// and via `npm run create-tables`.
//
// The GSIs let the ODM Query directly (e.g. all Questions for a quiz) instead
// of scanning the whole table — the key fix for large data (57k+ questions).

import {
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { rawClient } from "../config/dynamo.js";
import "../models/index.js"; // populate the registry
import { allModels } from "./odm.js";
import { indexedFields, indexNameForField } from "./indexes.js";

async function describeTable(name) {
  try {
    const res = await rawClient.send(new DescribeTableCommand({ TableName: name }));
    return res.Table;
  } catch (err) {
    if (err.name === "ResourceNotFoundException") return null;
    throw err;
  }
}

// Build the AttributeDefinitions + GSI definitions for a model's indexed fields.
function gsiDefs(fields) {
  const attrs = fields.map((f) => ({ AttributeName: f, AttributeType: "S" }));
  const gsis = fields.map((f) => ({
    IndexName: indexNameForField(f),
    KeySchema: [{ AttributeName: f, KeyType: "HASH" }],
    Projection: { ProjectionType: "ALL" }, // full item, so reads need no extra fetch
  }));
  return { attrs, gsis };
}

async function createOne(model) {
  const TableName = model.tableName;
  const fields = indexedFields(model.modelName);
  const existing = await describeTable(TableName);

  if (!existing) {
    const { attrs, gsis } = gsiDefs(fields);
    await rawClient.send(new CreateTableCommand({
      TableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "_id", AttributeType: "S" }, ...attrs],
      KeySchema: [{ AttributeName: "_id", KeyType: "HASH" }],
      ...(gsis.length ? { GlobalSecondaryIndexes: gsis } : {}),
    }));
    await waitUntilTableExists({ client: rawClient, maxWaitTime: 120 }, { TableName });
    return { table: TableName, created: true, addedIndexes: fields };
  }

  // Table exists — add any GSIs that are declared but missing. DynamoDB allows
  // only ONE new GSI per UpdateTable call, and requires the table to be ACTIVE
  // and no other index creating, so we add them one at a time.
  const present = new Set((existing.GlobalSecondaryIndexes || []).map((g) => g.IndexName));
  const missing = fields.filter((f) => !present.has(indexNameForField(f)));
  const added = [];
  for (const field of missing) {
    // eslint-disable-next-line no-await-in-loop
    const fresh = await describeTable(TableName);
    const stillCreating = (fresh.GlobalSecondaryIndexes || []).some((g) => g.IndexStatus !== "ACTIVE");
    if (fresh.TableStatus !== "ACTIVE" || stillCreating) break; // try again next boot
    try {
      // eslint-disable-next-line no-await-in-loop
      await rawClient.send(new UpdateTableCommand({
        TableName,
        AttributeDefinitions: [{ AttributeName: field, AttributeType: "S" }],
        GlobalSecondaryIndexUpdates: [{
          Create: {
            IndexName: indexNameForField(field),
            KeySchema: [{ AttributeName: field, KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        }],
      }));
      added.push(field);
    } catch (err) {
      // LimitExceeded (too many GSIs creating at once) etc. — retry next boot.
      console.warn(`  (index ${indexNameForField(field)} on ${TableName} deferred: ${err.name || err.message})`);
      break;
    }
  }
  return { table: TableName, created: false, addedIndexes: added };
}

export async function ensureTables() {
  const results = [];
  for (const model of allModels()) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await createOne(model));
  }
  const created = results.filter((r) => r.created);
  const indexed = results.filter((r) => !r.created && r.addedIndexes && r.addedIndexes.length);
  if (created.length) {
    console.log(`✔ Created ${created.length} DynamoDB table(s): ${created.map((r) => r.table).join(", ")}`);
  }
  if (indexed.length) {
    for (const r of indexed) console.log(`✔ Added indexes on ${r.table}: ${r.addedIndexes.join(", ")}`);
  }
  return results;
}
