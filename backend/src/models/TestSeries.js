import mongoose from "mongoose";

const testSeriesSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Multi-tenant owner. null/absent = platform (admin) content; a User id =
    // a client's private practice item, visible/editable only by that client.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Hierarchy: Exam → Post → Category → Test.
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "ExamPost" },
    category: {
      type: String,
      enum: ["Full-Length", "Subject-wise", "Chapter-wise", "Previous Year"],
      required: true,
    },
    // "Practice Quizzes" section: when practice=true this item lives under a
    // PracticeStream → PracticeSubject instead of Exam → Post, and is excluded
    // from the normal Test Series listing. practiceKind is "quiz" or "test".
    practice: { type: Boolean, default: false },
    practiceKind: { type: String, enum: ["quiz", "test"], default: "test" },
    practiceStream: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeStream" },
    practiceSubject: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeSubject" },
    practiceTopic: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeTopic" }, // My Quiz only
    duration: { type: Number, required: true }, // minutes
    marks: { type: Number, required: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    // Manual blueprint the admin types when creating a test: which subjects and
    // how many questions each. Just a plan/guide — questions are added manually.
    subjectPlan: [
      {
        subject: { type: String, trim: true },
        count: { type: Number, default: 0 },
      },
    ],
    negativeMarking: { type: Number, default: 0.25 },
    schedule: { type: Date },
    status: { type: String, enum: ["draft", "scheduled", "published"], default: "draft" },
    attempts: { type: Number, default: 0 },
    // Public share link. When publicShare is on, ANYONE with the publicToken
    // URL can take this test without an account or login (read-only public
    // access — attempts are graded but not stored against a user).
    publicShare: { type: Boolean, default: false },
    publicToken: { type: String, index: true, default: null },
    // Optional expiry for the public link. When set and in the past, the link
    // stops working (null = never expires).
    publicExpiresAt: { type: Date, default: null },
    // How many people OPENED the public link (counted once per browser). Lets the
    // admin see reach/impressions, not just completions.
    publicViews: { type: Number, default: 0 },
    // CBT (Computer-Based Test) online exam. When cbtEnabled is on, this test is
    // published as a proctored-style online exam: anyone with the cbtToken URL
    // signs in with just their name + email (no OTP), takes the test, and gets
    // their full result (answers, explanations, rank) emailed to them. Unlike a
    // casual public share, every attempt is stored WITH the taker's identity so
    // the admin can rank all candidates. Kept separate from publicToken so an
    // item can be a CBT exam independently of any casual share link.
    cbtEnabled: { type: Boolean, default: false },
    cbtToken: { type: String, index: true, default: null },
    cbtExpiresAt: { type: Date, default: null }, // null = never expires
    cbtViews: { type: Number, default: 0 }, // opens (counted once per browser)
    // Per-user access control. Test series are PRIVATE by default: a new
    // student sees a test only if visibleToAll is turned on, or they have an
    // explicit access entry (visible:true, optionally time-limited).
    visibleToAll: { type: Boolean, default: false },
    access: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        visible: { type: Boolean, default: true },
        validUntil: { type: Date, default: null },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("TestSeries", testSeriesSchema);
