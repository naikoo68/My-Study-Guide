import mongoose from "../db/odm.js";

// A scheduled Facebook auto-post rule. At each scheduled time it picks a
// question from the chosen content scope (subject / session / quiz / test) and
// posts it to the configured Facebook Page. Independent of the Notice Board.
const fbScheduleSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" }, // admin label, e.g. "Daily Accountancy question"
    enabled: { type: Boolean, default: true },

    // Post type:
    //   "question"  (default) — draw a question from `source` and post it (existing behaviour).
    //   "custom"              — post a fixed admin-written text + uploaded media (no question).
    //   "flashcard"           — draw a question from `source` and post it as a combined
    //                           flashcard image (question panel + answer panel).
    kind: { type: String, enum: ["question", "custom", "flashcard"], default: "question" },
    // Custom-post content (used only when kind === "custom").
    customText: { type: String, default: "" }, // the post text / caption
    customMedia: { type: [String], default: [] }, // hosted image URLs; the first image is attached
    // A public video URL. When set, the custom post is published as a REEL
    // (short vertical video) to the selected networks instead of a photo. Takes
    // priority over customMedia (post either a Reel OR a photo).
    customVideo: { type: String, default: "" },

    // Reel mode for question/flashcard schedules. When `asReel` is on, each run
    // renders the question/flashcard card image (exactly as a normal auto-post)
    // and then mixes it with a music track into a vertical MP4, published as a
    // Reel instead of a photo.
    asReel: { type: Boolean, default: false },
    // Reel length in seconds — the composed video is trimmed to this (default 30s).
    reelDuration: { type: Number, default: 30 },
    // Also share the post's IMAGE as a 24h STORY to the selected networks
    // (Facebook Page Story + Instagram Story), in addition to the normal post.
    asStory: { type: Boolean, default: false },
    // A LIBRARY of music tracks (public URLs). The schedule ROTATES through them
    // — each Reel uses the next track, wrapping back to the first once every
    // track has been used — so a set of songs is reused without re-uploading.
    customAudios: { type: [String], default: [] },
    // Which track to use next (index into customAudios); advances after each Reel.
    audioIndex: { type: Number, default: 0 },
    // DEPRECATED single-track field, kept for backward compatibility with
    // schedules created before the rotating library existed.
    customAudio: { type: String, default: "" },

    // Where questions are drawn from. The DEEPEST set id wins (quiz > session >
    // subject > testSeries). `label` is a human-readable trail for the UI.
    source: {
      label: { type: String, default: "" },
      subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
      session: { type: mongoose.Schema.Types.ObjectId, ref: "Session", default: null },
      quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", default: null },
      testSeries: { type: mongoose.Schema.Types.ObjectId, ref: "TestSeries", default: null },
      // A single specific question (set from the question view). When present it
      // overrides the scope above — the schedule posts exactly this question.
      question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", default: null },
    },

    // "recurring" = post at `times` on `days`; "once" = post a single time at `runAt`.
    mode: { type: String, enum: ["recurring", "once"], default: "recurring" },
    runAt: { type: Date, default: null }, // one-off scheduled time (mode "once")

    // When to post (recurring). `times` are "HH:MM" (24h) in `timezone`.
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
    // When true (default), the schedule STOPS once every question in its source
    // has been posted (no repeats): it disables itself and stamps `completedAt`.
    // When false it recycles the pool and keeps posting forever (old behaviour).
    stopWhenExhausted: { type: Boolean, default: true },

    // Destinations & format.
    toFacebook: { type: Boolean, default: true }, // post to the Facebook Page
    toInstagram: { type: Boolean, default: false }, // also cross-post to Instagram (forces an image)
    asImage: { type: Boolean, default: false }, // render the question as an image card (Facebook)
    imageUrl: { type: String, default: "" }, // pre-captured screenshot (client-rendered) to post as-is

    // Runtime bookkeeping.
    postedQuestionIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // avoid repeats until exhausted
    lastSlot: { type: String, default: "" }, // "YYYY-MM-DD HH:MM" of the last fired slot (dedupe guard)
    lastRunAt: { type: Date, default: null },
    lastResult: { type: String, default: "" }, // last outcome (ok / error) for admin visibility
    postCount: { type: Number, default: 0 },
    poolSize: { type: Number, default: 0 }, // total questions in the source at the last run (for "X of Y posted")
    completedAt: { type: Date, default: null }, // set when the source was fully posted (stopWhenExhausted)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("FbSchedule", fbScheduleSchema);
