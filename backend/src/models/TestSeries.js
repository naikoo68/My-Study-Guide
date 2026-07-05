import mongoose from "mongoose";

const testSeriesSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Hierarchy: Exam → Post → Category → Test.
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "ExamPost" },
    category: {
      type: String,
      enum: ["Full-Length", "Subject-wise", "Chapter-wise", "Previous Year"],
      required: true,
    },
    duration: { type: Number, required: true }, // minutes
    marks: { type: Number, required: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    negativeMarking: { type: Number, default: 0.25 },
    schedule: { type: Date },
    status: { type: String, enum: ["draft", "scheduled", "published"], default: "draft" },
    attempts: { type: Number, default: 0 },
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
