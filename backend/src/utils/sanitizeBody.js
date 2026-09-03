// Guards generic create/update handlers that spread the raw request body into a
// model (`Model.create({ ...req.body })` / `findByIdAndUpdate(id, { ...req.body })`).
//
// Without this, a caller can set fields that are meant to be assigned only by
// the server or by dedicated endpoints — a "mass assignment" hole. Concretely a
// client/institute-admin could otherwise:
//   - set `tenantId` to another institute → break multi-tenant isolation,
//   - set `owner` to claim/plant content in someone else's space,
//   - set `_id` to spoof or collide with an id,
//   - flip `deleted`/`deletedAt` to un-delete or hide records,
//   - forge a `publicToken` / inflate `publicViews` (public share links are
//     created only through the dedicated share endpoint).
//
// These are never legitimately set via the generic create/update body, so we
// strip them here. Everything else (the real content fields) passes through, so
// this is a denylist by design — safe against accidentally dropping valid
// fields as models grow.
const PROTECTED_FIELDS = [
  "_id",
  "id",
  "__v",
  "tenantId",
  "owner",
  "createdAt",
  "updatedAt",
  "deleted",
  "deletedAt",
  "publicToken",
  "publicViews",
];

// Per-model ALLOWLISTS for the tenant/owner-scoped content nodes. Only these
// fields may be set via the generic create/update body; anything else (including
// slug, owner, tenantId, public* and timestamps) is dropped. This is stricter
// than the denylist: new sensitive fields are excluded by DEFAULT until added
// here on purpose. (`slug` is always server-generated, so it's never allowed.)
export const ALLOW = {
  STREAM: ["name", "icon", "color", "image", "description", "order", "isActive", "disabled"],
  SUBJECT: ["stream", "name", "icon", "color", "image", "description", "isActive", "disabled"],
  TOPIC: ["subject", "title", "index", "description", "isActive", "disabled"],
  SESSION: ["subject", "topic", "title", "index", "difficulty", "isActive"],
  QUIZ: ["subject", "session", "title", "index", "difficulty", "isActive", "disabled", "aiTopic", "aiSubtopics"],
  P_STREAM: ["kind", "name", "icon", "color", "image", "description", "order", "isActive", "disabled"],
  P_EXAM: ["stream", "name", "icon", "color", "image", "description", "order", "isActive", "disabled"],
  P_SUBJECT: ["stream", "exam", "name", "icon", "color", "image", "description", "order", "isActive", "disabled"],
  P_TOPIC: ["subject", "name", "icon", "color", "description", "order", "isActive", "disabled"],
};

// Sanitize a request body before spreading it into a model.
//   sanitizeBody(body)                      → legacy denylist (strip PROTECTED_FIELDS)
//   sanitizeBody(body, ["field"])           → denylist + extra fields stripped
//   sanitizeBody(body, { allow: [...] })    → ALLOWLIST: keep ONLY listed fields
// In allowlist mode, protected fields and `slug` are NEVER kept even if listed.
export function sanitizeBody(body, opts = []) {
  const src = { ...(body || {}) };
  if (opts && !Array.isArray(opts) && Array.isArray(opts.allow)) {
    const out = {};
    for (const field of opts.allow) {
      if (PROTECTED_FIELDS.includes(field) || field === "slug") continue; // never client-set
      if (Object.prototype.hasOwnProperty.call(src, field)) out[field] = src[field];
    }
    return out;
  }
  for (const field of PROTECTED_FIELDS) delete src[field];
  if (Array.isArray(opts)) for (const field of opts) delete src[field];
  return src;
}
