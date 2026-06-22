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
  },
  { timestamps: true }
);

export default mongoose.model("TestSeries", testSeriesSchema);
