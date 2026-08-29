import mongoose from "../../db/odm.js";

// Global plugin powering the site-wide Recycle Bin.
//
// (A) FIELDS — give every top-level model a `deleted`/`deletedAt` flag so any
//     delete can be soft (routed to the Recycle Bin) instead of destroying data.
//     Models that already declare `deleted` and embedded sub-docs are skipped.
//
// (B) READ HOOKS — auto-hide soft-deleted documents from every READ (find,
//     findOne, count(Documents), distinct, aggregate). This means lists, counts,
//     search and analytics across the whole app exclude deleted items WITHOUT
//     having to edit each query. Important design choices that keep it safe:
//       • Only READ ops are hooked — never update/delete ops. So soft-delete
//         (findByIdAndUpdate), restore (findByIdAndUpdate) and permanent delete
//         (deleteMany/findByIdAndDelete) all still see the deleted docs and work.
//       • If a query already references `deleted` (e.g. the Recycle Bin listing
//         uses `{ deleted: true }`), the hook leaves it alone.
//       • Pass `{ withDeleted: true }` as a query option to opt out explicitly.
//
// NOTE: these hooks run on the real Mongoose engine (DB_ENGINE=mongo/oracle).
// On the DynamoDB compatibility engine query hooks don't run, so there lists
// still rely on the manual NOT_DELETED filter — harmless either way.

const READ_OPS = ["count", "countDocuments", "find", "findOne", "distinct"];

export default function softDeleteFieldsPlugin(schema) {
  // Skip embedded sub-document schemas (they don't own a collection).
  if (schema.options && schema.options._id === false) return;

  // (A) fields
  if (!schema.path("deleted")) {
    schema.add({ deleted: { type: Boolean, default: false } });
  }
  if (!schema.path("deletedAt")) {
    schema.add({ deletedAt: { type: Date, default: null } });
  }

  // (B) read hooks — hide soft-deleted docs from normal reads.
  schema.pre(READ_OPS, function hideDeleted() {
    try {
      if (this.getOptions && this.getOptions().withDeleted) return; // explicit opt-out
      const q = this.getQuery();
      if (q && q.deleted === undefined) q.deleted = { $ne: true };
    } catch {
      /* never let the hook break a query */
    }
  });

  // Aggregations: prepend a $match unless the pipeline already matches `deleted`.
  schema.pre("aggregate", function hideDeletedAgg() {
    try {
      const pipeline = this.pipeline();
      const first = pipeline[0];
      if (first && first.$match && "deleted" in first.$match) return;
      pipeline.unshift({ $match: { deleted: { $ne: true } } });
    } catch {
      /* ignore */
    }
  });
}
