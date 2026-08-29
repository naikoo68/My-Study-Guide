import mongoose from "../../db/odm.js";

// Global plugin: give EVERY top-level model a soft-delete flag so any admin
// delete can be routed through the site-wide Recycle Bin instead of destroying
// data. This adds fields ONLY — there are no query hooks. List queries opt in
// by spreading NOT_DELETED (see utils/softDelete.js), matching the existing
// content-tree pattern, which keeps behaviour explicit and predictable.
//
// Models that already declare `deleted` (the content tree, User, Tenant) are
// left untouched. Embedded sub-document schemas (no own collection) are skipped.
export default function softDeleteFieldsPlugin(schema) {
  // Skip embedded sub-document schemas (they don't own a collection).
  if (schema.options && schema.options._id === false) return;

  if (!schema.path("deleted")) {
    schema.add({ deleted: { type: Boolean, default: false } });
  }
  if (!schema.path("deletedAt")) {
    schema.add({ deletedAt: { type: Date, default: null } });
  }
}
