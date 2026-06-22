import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
    testSeries: { type: mongoose.Schema.Types.ObjectId, ref: "TestSeries" },
    text: { type: String, required: true },
    image: { type: String }, // Cloudinary URL
    options: {
      type: [String],
      validate: [(v) => v.length === 4, "A question must have exactly 4 options"],
      required: true,
    },
    correct: { type: Number, required: true, min: 0, max: 3 },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
    topic: { type: String },
    explanation: { type: String },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
  },
  { timestamps: true }
);

export default mongoose.model("Question", questionSchema);
