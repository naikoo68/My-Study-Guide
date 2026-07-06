import mongoose from "mongoose";

// A question is either:
//  - "mcq":      4 options + a correct index
//  - "matching": two columns (A & B) shown to the student, plus answer options
//                (sequence strings like "1-III, 2-I…") with a correct index
// Text/options/columns may contain LaTeX between $...$ for equation rendering.
const questionSchema = new mongoose.Schema(
  {
    // Optional: test-series questions may not belong to a subject.
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
    session: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz" },
    testSeries: { type: mongoose.Schema.Types.ObjectId, ref: "TestSeries" },
    type: { type: String, enum: ["mcq", "matching", "statement", "pair"], default: "mcq" },
    text: { type: String, required: true },
    image: { type: String },

    // MCQ fields
    options: {
      type: [String],
      validate: {
        validator: function (v) {
          // Only enforce the 4-option rule for MCQs.
          return this.type === "matching" || (Array.isArray(v) && v.length === 4);
        },
        message: "A multiple-choice question must have exactly 4 options",
      },
    },
    correct: { type: Number, min: 0 }, // index of the correct option (both types)

    // Matching fields: two columns shown to the student; the answer is still
    // one of the `options` above (each option is a sequence like "1-III, 2-I…").
    columnA: { type: [String], default: undefined },
    columnB: { type: [String], default: undefined },

    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
    topic: { type: String },
    explanation: { type: String }, // detailed explanation of the correct answer
    // Optional brief explanation for each option (parallel to `options`), shown
    // after answering so the student learns why each choice is right/wrong.
    optionExplanations: { type: [String], default: undefined },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
  },
  { timestamps: true }
);

export default mongoose.model("Question", questionSchema);
