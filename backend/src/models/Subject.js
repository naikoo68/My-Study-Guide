import mongoose from "../db/odm.js";

const subjectSchema = new mongoose.Schema(
  {
    stream: { type: mongoose.Schema.Types.ObjectId, ref: "Stream" }, // HOME/primary stream (where it was first added)
    // Additional streams this same subject is ALSO listed under. A subject is
    // never duplicated across streams — instead the other streams are linked
    // here, so its topics/quizzes/questions stay shared. Opening a linked
    // subject navigates back to its HOME `stream`. See createSubject/listStreamSubjects.
    streams: [{ type: mongoose.Schema.Types.ObjectId, ref: "Stream" }],
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    icon: { type: String, default: "BookOpen" },
    color: { type: String, default: "from-blue-500 to-indigo-600" },
    // Optional custom logo (image URL or small base64 data URI). When set it is
    // shown instead of the icon/emoji. Blank = auto-pick from the name.
    image: { type: String, default: "" },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    // Admin "disable" switch — hides this subject (and its children) from
    // students/public but keeps it in the admin manager. See Stream.js.
    disabled: { type: Boolean, default: false },
    // Recycle Bin (soft delete) — see utils/softDelete.js.
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Subject", subjectSchema);
