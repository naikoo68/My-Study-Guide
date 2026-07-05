import mongoose from "mongoose";

const testSeriesSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
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
    // Per-user access control. When visibleToAll is true, any user without an
    // explicit entry can see this test. An entry can hide the test from a user
    // (visible:false) or grant time-limited access (validUntil).
    visibleToAll: { type: Boolean, default: true },
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
