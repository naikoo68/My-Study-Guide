import mongoose from "../db/odm.js";

// Subject inside a Practice stream. Holds the practice items (quizzes/tests).
const practiceSubjectSchema = new mongoose.Schema(
  {
    stream: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeStream", required: true },
    // Optional parent Exam — set ONLY for "My Quiz" content, where the hierarchy
    // is Stream → Exam → Subject → Topic → Quiz. My Test Series / Previous Papers
    // leave this null (they stay Stream → Subject → …). `stream` is always kept
    // in sync with the exam's stream so existing stream-scoped queries still work.
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeExam", default: null },
    // Additional Exams this SAME subject is ALSO listed under (My Quiz only).
    // A subject is never duplicated across exams — the other exams are linked
    // here so its topics/quizzes stay shared. `exam` above is the HOME exam
    // (where it was first added); opening a linked subject shows the same shared
    // content. See linkSubjectToExam / unlinkSubjectFromExam / listExamSubjects.
    exams: [{ type: mongoose.Schema.Types.ObjectId, ref: "PracticeExam" }],
    // Owner (client) — null/absent for platform content. See PracticeStream.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true },
    slug: { type: String, default: "" },
    icon: { type: String, default: "BookOpen" },
    color: { type: String, default: "from-violet-500 to-fuchsia-600" },
    // Optional custom logo (image URL or small base64 data URI). When set it is
    // shown instead of the lucide `icon`. Blank = auto-pick an icon from the name.
    image: { type: String, default: "" },
    description: { type: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Admin "disable" switch — hides this node from students/public/client
    // browse & play, but keeps it visible in the admin manager. See PracticeStream.
    disabled: { type: Boolean, default: false },
    // Public share link (see PracticeStream). Anyone with the link sees every
    // quiz/test under this subject; enabling cascades to items beneath it.
    publicShare: { type: Boolean, default: false },
    publicToken: { type: String, index: true, default: null },
    publicExpiresAt: { type: Date, default: null }, // null = never expires
    publicViews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("PracticeSubject", practiceSubjectSchema);
