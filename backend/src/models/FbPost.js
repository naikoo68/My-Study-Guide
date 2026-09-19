import mongoose from "../db/odm.js";

// A PERMANENT record of one successful Facebook Page publication. One row is
// written every time Facebook accepts a post (the main Page or an extra Page),
// keyed by Meta's returned post id. It is intentionally INDEPENDENT of
// FbSchedule, so the history and the lifetime count SURVIVE a schedule being
// edited, completed, or deleted — giving a reliable Facebook total and an audit
// trail that can be reconciled against Facebook itself.
const fbPostSchema = new mongoose.Schema(
  {
    facebookPostId: { type: String, required: true }, // Meta's post/photo id (the source of truth)
    pageId: { type: String, default: "" },            // the Page it was published to
    pageLabel: { type: String, default: "" },         // human label of an extra Page ("" = the main Page)
    // The schedule that produced it (may be deleted later — the snapshot fields
    // below keep the history meaningful even after the schedule is gone).
    schedule: { type: mongoose.Schema.Types.ObjectId, ref: "FbSchedule", default: null },
    scheduleTitle: { type: String, default: "" },     // snapshot of the schedule title/label
    sourceLabel: { type: String, default: "" },       // e.g. "My Quiz › … › Quiz 3"
    question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", default: null },
    kind: { type: String, default: "question" },      // question | flashcard | custom
    postSerial: { type: Number, default: null },      // the site-wide continuous post number at the time
  },
  { timestamps: true }
);

// Newest-first history lookups, and a guard against recording the same Meta id
// twice (a retry that double-fires won't inflate the count).
fbPostSchema.index({ tenantId: 1, createdAt: -1 });
fbPostSchema.index({ tenantId: 1, facebookPostId: 1 }, { unique: true, sparse: true });

export default mongoose.model("FbPost", fbPostSchema);
