import mongoose from "../db/odm.js";

// A topic groups sessions within a subject.
// Hierarchy: Subject → Topic → Session → Questions
const topicSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    title: { type: String, required: true, trim: true },
    index: { type: Number, default: 1 },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    // Admin "disable" switch — hides this topic (and its children) from
    // students/public but keeps it in the admin manager. See Stream.js.
    disabled: { type: Boolean, default: false },
    // Recycle Bin (soft delete) — see utils/softDelete.js.
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Topic", topicSchema);
