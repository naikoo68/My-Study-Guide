// Super-admin endpoint: share (COPY) a content node into one or more institutes.
// The copy appears automatically in each institute's account (no accept step).
// Large shares (a whole stream × many institutes) run as a background job the
// client polls for progress — mirrors the account-to-account accept flow.

import { SHARE_AREAS, resolveTargetTenants, shareNodeToTenant } from "../utils/instituteShare.js";

/* ---- In-memory jobs (single instance), cleaned up 20 min after last update. ---- */
const shareJobs = new Map();
const newJobId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function guardJob(id, p) {
  Promise.resolve(p).catch((e) => {
    const j = shareJobs.get(id);
    if (j) { j.status = "error"; j.error = e?.message || "Could not share the content."; j.updatedAt = Date.now(); }
    console.error("[instituteShare] background job failed:", e?.stack || e);
  });
}
setInterval(() => {
  const cutoff = Date.now() - 20 * 60 * 1000;
  for (const [id, j] of shareJobs) if (j.updatedAt < cutoff) shareJobs.delete(id);
}, 5 * 60 * 1000).unref();

// POST /api/institute-share
// Body: { area, id, all?:bool, tenantIds?:[] }
export async function shareToInstitutes(req, res) {
  const area = String(req.body?.area || "").trim();
  const all = req.body?.all === true;
  const tenantIds = Array.isArray(req.body?.tenantIds) ? req.body.tenantIds : [];
  // Accept a single `id` OR multiple `ids` (bulk "Share selected"). De-dupe and
  // keep only valid ObjectIds.
  const rawIds = [req.body?.id, ...(Array.isArray(req.body?.ids) ? req.body.ids : [])];
  const ids = [...new Set(rawIds.map((x) => String(x || "").trim()).filter((x) => /^[a-f0-9]{24}$/i.test(x)))];

  if (!SHARE_AREAS.includes(area)) return res.status(400).json({ message: "Invalid content type to share." });
  if (!ids.length) return res.status(400).json({ message: "Nothing valid selected to share." });
  if (!all && !tenantIds.length) return res.status(400).json({ message: "Choose at least one institute, or Share to all." });

  const targets = await resolveTargetTenants({ all, tenantIds });
  if (!targets.length) return res.status(404).json({ message: "No matching institutes to share with." });

  const jobId = newJobId();
  shareJobs.set(jobId, {
    user: String(req.user._id),
    status: "running",
    targetsTotal: targets.length,
    targetsDone: 0,
    sourcesTotal: ids.length,
    itemsCopied: 0,
    questionsCopied: 0,
    results: [],
    error: null,
    updatedAt: Date.now(),
  });

  guardJob(jobId, runShareJob(jobId, { area, ids, targets }));
  return res.status(202).json({ jobId, targets: targets.length, sources: ids.length });
}

async function runShareJob(jobId, { area, ids, targets }) {
  const job = shareJobs.get(jobId);
  if (!job) return;
  for (const t of targets) {
    let items = 0, questions = 0;
    const errors = [];
    for (const id of ids) {
      try {
        const r = await shareNodeToTenant({ area, id, tenantId: t.id }, () => { job.updatedAt = Date.now(); });
        items += r.items;
        questions += r.questions;
        job.itemsCopied += r.items;
        job.questionsCopied += r.questions;
      } catch (e) {
        errors.push(e?.message || "Failed");
      }
      job.updatedAt = Date.now();
    }
    job.results.push({ tenant: String(t.id), name: t.name, items, questions, ...(errors.length ? { error: errors.join("; ") } : {}) });
    job.targetsDone += 1;
    job.updatedAt = Date.now();
  }
  job.status = "done";
  job.updatedAt = Date.now();
}

// GET /api/institute-share/job/:id — poll share progress (scoped to starter).
export function shareJobStatus(req, res) {
  const job = shareJobs.get(req.params.id);
  if (!job || String(job.user) !== String(req.user._id)) return res.status(404).json({ message: "Job not found or expired." });
  res.json({
    status: job.status, // "running" | "done" | "error"
    targetsTotal: job.targetsTotal,
    targetsDone: job.targetsDone,
    itemsCopied: job.itemsCopied,
    questionsCopied: job.questionsCopied,
    results: job.results,
    error: job.error,
  });
}
