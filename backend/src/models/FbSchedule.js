import mongoose from "mongoose";

// A scheduled Facebook auto-post rule. At each scheduled time it picks a
// question from the chosen content scope (subject / session / quiz / test) and
// posts it to the configured Facebook Page. Independent of the Notice Board.
const fbScheduleSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" }, // admin label, e.g. "Daily Accountancy question"
    enabled: { type: Boolean, default: true },

    // Where questions are drawn from. The DEEPEST set id wins (quiz > session >
    // subject > testSeries). `label` is a human-readable trail for the UI.
    source: {
      label: { type: String, default: "" },
      subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
      session: { type: mongoose.Schema.Types.ObjectId, ref: "Session", default: null },
      quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", default: null },
      testSeries: { type: mongoose.Schema.Types.ObjectId, ref: "TestSeries", default: null },
    },

    // When to post. `times` are "HH:MM" (24h) interpreted in `timezone`.
    // `days` = weekdays 0(Sun)–6(Sat); empty means every day.
    times: { type: [String], default: [] },
    days: { type: [Number], default: [] },
    timezone: { type: String, default: "Asia/Kolkata" },

    // Post formatting.
    includeOptions: { type: Boolean, default: true }, // show the A/B/C/D options
    includeAnswer: { type: Boolean, default: false }, // reveal the correct answer + explanation
    includeLink: { type: Boolean, default: false }, // append the site link
    hashtags: { type: String, default: "" }, // optional trailing hashtags
    order: { type: String, enum: ["random", "sequential"], default: "random" },

    // Runtime bookkeeping.
    postedQuestionIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // avoid repeats until exhausted
    lastSlot: { type: String, default: "" }, // "YYYY-MM-DD HH:MM" of the last fired slot (dedupe guard)
    lastRunAt: { type: Date, default: null },
    lastResult: { type: String, default: "" }, // last outcome (ok / error) for admin visibility
    postCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("FbSchedule", fbScheduleSchema);
