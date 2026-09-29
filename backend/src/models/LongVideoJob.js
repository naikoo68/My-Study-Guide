import mongoose from "../db/odm.js";

// A long-video job ("Make & post video", a repeating long-video schedule, or
// "Publish" of a preview), saved so it SURVIVES a server restart / deploy:
// "Recent long videos" keeps showing it, and a job that was cut off by a
// restart is marked failed (with the reason) and can be retried with one tap.
// The live job still runs in memory (config/longVideo.js) — this is its record.
const longVideoJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true },       // the in-memory job id (UUID)
    tenantKey: { type: String, default: "" },      // the institute it belongs to
    status: { type: String, default: "queued" },   // queued | running | done | failed
    view: { type: mongoose.Schema.Types.Mixed, default: null },    // publicJob() snapshot
    request: { type: mongoose.Schema.Types.Mixed, default: null }, // what's needed to retry it
    retriedAs: { type: String, default: "" },      // the job id of its retry
  },
  { timestamps: true }
);
longVideoJobSchema.index({ tenantKey: 1, createdAt: -1 });
longVideoJobSchema.index({ jobId: 1 }, { unique: true });

export default mongoose.model("LongVideoJob", longVideoJobSchema);
