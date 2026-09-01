import mongoose from "../../db/odm.js";
import { getCurrentTenantId, isUnscoped, getShareContent, getShareAiKeys, getDefaultTenantId } from "../../utils/tenantContext.js";

// Models whose SHARED (null-tenant) platform rows are only visible to an
// institute when the super-admin has turned that institute's sharing switch ON.
// Everything else keeps the default behaviour (shared rows visible to all).
const CONTENT_SHARE_MODELS = new Set([
  "Stream", "Subject", "Topic", "Session", "Quiz", "Question",
  "TestSeries", "Exam", "ExamPost", "Notice", "Review", "Coupon",
  // "My Practice" / "My Quiz" hierarchy — platform (super-admin) practice
  // content is also gated by the sharing switch, so an institute with sharing
  // OFF doesn't see the platform's My-Quiz streams/subjects/topics/exams either.
  "PracticeStream", "PracticeSubject", "PracticeTopic", "PracticeExam",
]);

// The EXTRA tenant buckets a READ/aggregate of `modelName` may see, in addition
// to the current institute (tid). Returns either:
//   • an array of extra values to append to `$in` (e.g. [null] or
//     [null, <defaultTenantId>]), or
//   • null, meaning "strictly this institute — no shared rows".
//
// Platform-shareable models (the content library + AI keys) are GATED by the
// per-institute switch:
//   - switch OFF → null (own institute only).
//   - switch ON  → the institute may ALSO read the platform library, which
//     lives EITHER as null (content the super-admin created while unscoped) OR
//     under the DEFAULT tenant (content the one-time backfill migrated there).
//     Both are included so the whole library is shared, not just the null slice.
//
// Every OTHER model keeps the original behaviour (own + shared/global null rows)
// and NEVER includes the default tenant id — otherwise the default institute's
// PRIVATE data (students, attempts, messages, settings) would leak to every
// institute. This is the critical isolation guarantee of platform sharing.
function sharedBucketsFor(modelName) {
  const isAiKey = modelName === "AiKey";
  const isContent = CONTENT_SHARE_MODELS.has(modelName);
  if (isAiKey || isContent) {
    const on = isAiKey ? getShareAiKeys() : getShareContent();
    if (!on) return null; // switch OFF → strictly the institute's own
    const def = getDefaultTenantId();
    return def ? [null, def] : [null];
  }
  // Non-gated models: own + shared/global null rows, exactly as before. The
  // default tenant id is deliberately NOT added here.
  return [null];
}

// Global Mongoose plugin. Adds an optional `tenantId` to every model schema so
// records can be scoped to an institute (tenant). Applied globally in
// config/registerModelPlugins.js BEFORE any model schema is compiled.
//
// Two responsibilities:
//   (A) ALWAYS: add the `tenantId` field (Phase 2 — non-breaking).
//   (B) WHEN ENFORCEMENT IS ON: auto-scope every query/write to the current
//       request's tenant (Phase 3), reading it from the per-request context.
//
// Enforcement is OPT-IN via TENANT_ENFORCEMENT=on (default OFF). With it off,
// only the field is added and the app behaves exactly as before — so shipping
// this is safe. With a single (default) institute it's effectively a no-op even
// when on, because all data belongs to that one tenant.
//
// Safety rules when enforcement is on:
//   - The `Tenant` registry itself is never scoped.
//   - No request context (background jobs, startup scripts) → NOT scoped
//     (fail-open) so internal maintenance still works.
//   - An explicit unscoped context (super-admin / auth lookups) → NOT scoped.
//   - A query that already targets `tenantId` is left untouched.

const ENFORCE = process.env.TENANT_ENFORCEMENT === "on";

// Query middleware operations that should be tenant-scoped, split by intent:
//   READ  — may ALSO see shared/platform (null-tenant) content.
//   WRITE — strictly the current institute (never touch shared/other data).
const READ_OPS = ["count", "countDocuments", "find", "findOne"];
const WRITE_OPS = [
  "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace",
  "updateOne", "updateMany", "deleteOne", "deleteMany", "replaceOne",
];

// Design notes on the field:
// - NO index is declared here on purpose (a global plugin also runs on embedded
//   sub-document schemas; an index here would create junk indexes on the parent
//   at the sub-path). Real tenantId indexes are created per top-level collection
//   by the backfill (utils/backfillTenants.js).
export default function tenantIdPlugin(schema) {
  // Skip embedded sub-document schemas (they don't own a collection).
  if (schema.options && schema.options._id === false) return;
  // Don't redefine if a schema already declares it.
  if (!schema.path("tenantId")) {
    schema.add({ tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null } });
  }

  if (!ENFORCE) return; // Phase 2 behavior: field only, no scoping.

  const modelNameOfQuery = (q) => q?.model?.modelName;
  const modelNameOfAggregate = (a) => {
    try { return typeof a.model === "function" ? a.model()?.modelName : a.model?.modelName; }
    catch { return undefined; }
  };

  // Auto-scope READS to the current institute PLUS shared/platform content
  // (tenantId null or absent). Platform content is created by the super-admin,
  // who operates cross-tenant (unscoped), so it's stamped with a null tenant —
  // it must stay visible to every institute (and on PUBLIC, unauthenticated
  // reads like GET /streams, which resolve to the default institute). Using an
  // exact `tenantId = tid` match hid ALL admin-created content; `$in` with null
  // keeps per-institute isolation while sharing platform content.
  schema.pre(READ_OPS, function scopeRead() {
    if (isUnscoped()) return;
    const model = modelNameOfQuery(this);
    if (model === "Tenant") return;
    const tid = getCurrentTenantId();
    if (!tid) return; // no request context → don't scope (internal jobs)
    const q = this.getQuery();
    // Include shared/platform rows only when this institute is allowed to (see
    // sharedBucketsFor); otherwise restrict strictly to its own.
    if (q.tenantId === undefined) {
      const extra = sharedBucketsFor(model);
      q.tenantId = extra ? { $in: [tid, ...extra] } : tid;
    }
  });

  // Auto-scope WRITES/DELETES strictly to the current institute. Shared/platform
  // (null-tenant) content is managed ONLY by the super-admin (who runs
  // unscoped), so an institute admin can never modify or delete shared content
  // or another institute's data.
  schema.pre(WRITE_OPS, function scopeWrite() {
    if (isUnscoped()) return;
    if (modelNameOfQuery(this) === "Tenant") return;
    const tid = getCurrentTenantId();
    if (!tid) return;
    const q = this.getQuery();
    if (q.tenantId === undefined) q.tenantId = tid;
  });

  // Auto-scope aggregations by prepending a $match on tenantId.
  schema.pre("aggregate", function scopeAggregate() {
    if (isUnscoped()) return;
    const model = modelNameOfAggregate(this);
    if (model === "Tenant") return;
    const tid = getCurrentTenantId();
    if (!tid) return;
    const pipeline = this.pipeline();
    // Don't double-add if the caller already matches tenantId first.
    const first = pipeline[0];
    if (first && first.$match && "tenantId" in first.$match) return;
    // Include shared/platform rows only when allowed (see scopeRead / sharedBucketsFor).
    const extra = sharedBucketsFor(model);
    const match = extra ? { tenantId: { $in: [tid, ...extra] } } : { tenantId: tid };
    pipeline.unshift({ $match: match });
  });

  // Stamp new documents with the current tenant on save().
  schema.pre("save", function stampOnSave() {
    if (this.tenantId) return;
    if (isUnscoped()) return;
    const tid = getCurrentTenantId();
    if (tid) this.tenantId = tid;
  });

  // Stamp bulk inserts.
  schema.pre("insertMany", function stampOnInsertMany(next, docs) {
    if (!isUnscoped()) {
      const tid = getCurrentTenantId();
      if (tid && Array.isArray(docs)) {
        for (const d of docs) if (d && d.tenantId == null) d.tenantId = tid;
      }
    }
    next();
  });
}
