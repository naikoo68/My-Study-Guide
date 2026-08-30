import mongoose from "../db/odm.js";

// Exam inside a Practice stream — an OPTIONAL grouping level used ONLY by the
// "My Quiz" sub-module, which drills Stream → Exam → Subject → Topic → Quiz.
// (My Test Series and Previous Papers do NOT use this level.) Kept separate so
// practice content never mixes with the main quiz hierarchy.
const practiceExamSchema = new mongoose.Schema(
  {
    stream: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeStream", required: true },
    // Owner (client) — null/absent for platform (admin) content. See PracticeStream.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true },
    slug: { type: String, default: "" },
    icon: { type: String, default: "ClipboardList" },
    color: { type: String, default: "from-violet-500 to-fuchsia-600" },
    // Optional custom logo (image URL or small base64 data URI). When set it is
    // shown instead of the lucide `icon`. Blank = auto-pick an icon from the name.
    image: { type: String, default: "" },
    description: { type: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Admin "disable" switch — hides this node (and everything under it) from
    // students/public/client browse & play, but keeps it visible in the admin
    // manager so it can be re-enabled. See PracticeStream.
    disabled: { type: Boolean, default: false },
    // Public share link (see PracticeStream). Anyone with the link sees every
    // quiz under this exam; enabling cascades to the quizzes beneath it.
    publicShare: { type: Boolean, default: false },
    publicToken: { type: String, index: true, default: null },
    publicExpiresAt: { type: Date, default: null }, // null = never expires
    publicViews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("PracticeExam", practiceExamSchema);
