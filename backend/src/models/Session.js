import mongoose from "mongoose";

// A session/chapter within a subject.
const sessionSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    title: { type: String, required: true, trim: true },
    index: { type: Number, default: 1 },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Session", sessionSchema);
