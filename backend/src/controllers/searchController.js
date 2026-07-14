import Stream from "../models/Stream.js";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";
import Session from "../models/Session.js";
import Quiz from "../models/Quiz.js";
import Question from "../models/Question.js";
import TestSeries from "../models/TestSeries.js";

// Escape user input so it is treated as a literal string inside a RegExp.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LIMIT = 8; // max results per content type

// ---- Question matching (word-level, mirrors frontend lib/questions.js) ----
// Questions store the stem (`text`) separately from `options`, so pasting a
// whole "stem + (a).. (b).." string never matches as one phrase. Instead we
// score by the share of query WORDS found anywhere in the question.

// All searchable text of a question, across every question type.
function questionHaystack(q) {
  const parts = [
    q.text,
    q.explanation,
    q.topic,
    q.section,
    q.assertion,
    q.reason,
    ...(q.options || []),
    ...(q.optionExplanations || []),
    ...(q.columnA || []),
    ...(q.columnB || []),
    ...(Array.isArray(q.tableRows) ? q.tableRows.flat(Infinity) : []),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

// 0–100%: full phrase present → 100; else the share of query words found.
function questionMatchPercent(queryLower, words, q) {
  const hay = questionHaystack(q);
  if (!hay) return 0;
  if (hay.includes(queryLower)) return 100;
  if (!words.length) return 0;
  const matched = words.filter((w) => hay.includes(w)).length;
  return Math.round((matched / words.length) * 100);
}

// Short preview of a question stem for the results list.
const preview = (t, n = 90) => {
  const s = String(t || "").replace(/\$/g, "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
};

// Option labels that must NOT count as search words (roman numerals ii–xv;
// single letters a/b/c/d and single digits 1/2 are dropped by the length rule).
const OPTION_LABELS = new Set(["ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xiii", "xiv", "xv"]);

// Meaningful words from a query. Splits on ANY non-alphanumeric char so labels
// like "(a)", "1.", "(ii)" detach from the real word — "(a)Dual" → "dual".
// Then drops single letters (a,b,c,d), single digits, and roman-numeral labels,
// so the search keys off the question body only, never the option marker/place.
const meaningfulWords = (query) => [
  ...new Set(
    String(query || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((w) => w.length >= 2 && !OPTION_LABELS.has(w))
  ),
];

// GET /api/search?q=...
// Global metadata search across the whole content hierarchy
// (Stream → Subject → Topic → Session → Quiz) plus Test Series.
// Visibility is role-aware (optionalAuth):
//   • admin            → everything, including inactive / draft items and
//                        client-owned practice items (so the admin panel can
//                        surface ALL metadata).
//   • everyone else    → only active, published, public platform content.
// Each result carries a public browse `path` and an `adminPath` so the same
// payload can drive both the public/landing search and the admin search.
export async function globalSearch(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ query: q, count: 0, results: [] });

  const rx = new RegExp(escapeRegex(q), "i");
  const isAdmin = req.user?.role === "admin";
  const active = isAdmin ? {} : { isActive: true };

  // Test-series visibility: admins see all (incl. drafts + client practice
  // items); everyone else sees only public, published platform tests.
  const testMatch = { name: rx };
  if (!isAdmin) {
    testMatch.practice = { $ne: true };
    testMatch.visibleToAll = true;
    testMatch.status = "published";
    testMatch.owner = null;
  }

  const [streams, subjects, topics, sessions, quizzes, tests] = await Promise.all([
    Stream.find({ name: rx, ...active }).sort("order name").limit(LIMIT).lean(),
    Subject.find({ name: rx, ...active }).limit(LIMIT).populate("stream", "name").lean(),
    Topic.find({ title: rx, ...active }).limit(LIMIT).populate("subject", "name").lean(),
    Session.find({ title: rx, ...active })
      .limit(LIMIT)
      .populate("subject", "name")
      .populate("topic", "title")
      .lean(),
    Quiz.find({ title: rx, ...active })
      .limit(LIMIT)
      .populate("subject", "name")
      .populate("session", "title topic")
      .lean(),
    TestSeries.find(testMatch)
      .limit(LIMIT)
      .populate("exam", "name")
      .populate("post", "name")
      .lean(),
  ]);

  const results = [];

  for (const s of streams) {
    results.push({
      type: "Stream",
      id: String(s._id),
      title: s.name,
      subtitle: "Stream",
      path: `/quiz/stream/${s._id}`,
      adminPath: "/admin/content",
      active: s.isActive !== false,
    });
  }

  for (const s of subjects) {
    results.push({
      type: "Subject",
      id: String(s._id),
      title: s.name,
      subtitle: [s.stream?.name, "Subject"].filter(Boolean).join(" · "),
      path: `/quiz/${s._id}`,
      adminPath: "/admin/content",
      active: s.isActive !== false,
    });
  }

  for (const t of topics) {
    results.push({
      type: "Topic",
      id: String(t._id),
      title: t.title,
      subtitle: [t.subject?.name, "Topic"].filter(Boolean).join(" · "),
      path: t.subject ? `/quiz/${t.subject._id}/${t._id}` : "/quiz",
      adminPath: "/admin/content",
      active: t.isActive !== false,
    });
  }

  for (const s of sessions) {
    results.push({
      type: "Session",
      id: String(s._id),
      title: s.title,
      subtitle: [s.subject?.name, s.topic?.title].filter(Boolean).join(" · ") || "Session",
      path: s.subject && s.topic ? `/quiz/${s.subject._id}/${s.topic._id}/${s._id}` : "/quiz",
      adminPath: "/admin/content",
      active: s.isActive !== false,
    });
  }

  for (const qz of quizzes) {
    const subjId = qz.subject?._id;
    const sessId = qz.session?._id;
    const topicId = qz.session?.topic; // ObjectId ref on the session
    const path =
      subjId && sessId && topicId
        ? `/quiz/${subjId}/${topicId}/${sessId}/${qz._id}`
        : "/quiz";
    results.push({
      type: "Quiz",
      id: String(qz._id),
      title: qz.title,
      subtitle: [qz.subject?.name, qz.session?.title].filter(Boolean).join(" · ") || "Quiz",
      path,
      adminPath: "/admin/content",
      active: qz.isActive !== false,
    });
  }

  for (const t of tests) {
    // A practice item (client My Quiz / My Test) vs a platform test series.
    const isPractice = t.practice === true;
    const type = isPractice ? (t.practiceKind === "quiz" ? "My Quiz" : "My Test") : "Test";
    results.push({
      type,
      id: String(t._id),
      title: t.name,
      subtitle: isPractice
        ? "Practice item"
        : [t.exam?.name, t.post?.name].filter(Boolean).join(" · ") || "Test Series",
      path: !isPractice && t.exam && t.post ? `/test-series/${t.exam._id}/${t.post._id}` : "/test-series",
      adminPath: isPractice ? "/admin/tests" : "/admin/tests",
      active: t.status === "published",
    });
  }

  // ---- Questions (by their text / options / statements / etc.) ----
  // Narrow candidates using the most distinctive query words (≥4 chars; falls
  // back to ≥2), then score every candidate by word overlap and keep 40%+.
  const queryLower = q.toLowerCase();
  const allWords = meaningfulWords(q); // ignores option labels a/b/c/d, 1/2, i/ii…
  let candidateWords = [...allWords]
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 12);
  if (!candidateWords.length) candidateWords = allWords.slice(0, 12);

  let questionsScanned = 0;
  let questionsMatched = 0;

  if (candidateWords.length) {
    const or = [];
    for (const w of candidateWords) {
      const wrx = new RegExp(escapeRegex(w), "i");
      or.push({ text: wrx }, { options: wrx }, { assertion: wrx }, { reason: wrx }, { explanation: wrx });
    }
    const qFilter = { $or: or };
    if (!isAdmin) {
      qFilter.status = "published";
      qFilter.owner = req.user ? { $in: [null, req.user._id] } : null;
    }

    const candidates = await Question.find(qFilter)
      .limit(200)
      .populate("subject", "name")
      .populate("session", "title topic")
      .populate("quiz", "title")
      .populate({
        path: "testSeries",
        select: "name exam post practice practiceKind",
        populate: [
          { path: "exam", select: "name" },
          { path: "post", select: "name" },
        ],
      })
      .lean();

    questionsScanned = candidates.length;

    const scored = candidates
      .map((qq) => ({ qq, m: questionMatchPercent(queryLower, allWords, qq) }))
      .filter((x) => x.m >= 40)
      .sort((a, b) => b.m - a.m)
      .slice(0, 10);
    questionsMatched = scored.length;

    for (const { qq, m } of scored) {
      let path = "/quiz";
      let adminPath = "/admin/content";
      let subtitle = "Question";
      if (qq.testSeries) {
        const ts = qq.testSeries;
        const isPractice = ts.practice === true;
        adminPath = "/admin/tests";
        path = !isPractice && ts.exam && ts.post ? `/test-series/${ts.exam._id}/${ts.post._id}` : "/test-series";
        subtitle = ts.name ? `${ts.name} · Question` : "Test question";
      } else {
        const subjId = qq.subject?._id;
        const sessId = qq.session?._id;
        const topicId = qq.session?.topic;
        const quizId = qq.quiz?._id;
        if (subjId && sessId && topicId && quizId) path = `/quiz/${subjId}/${topicId}/${sessId}/${quizId}`;
        subtitle = [qq.subject?.name, qq.quiz?.title].filter(Boolean).join(" · ") || "Question";
      }
      results.push({
        type: "Question",
        id: String(qq._id),
        title: preview(qq.text),
        subtitle,
        match: m,
        path,
        adminPath,
        active: qq.status === "published",
      });
    }
  }

  res.json({
    query: q,
    count: results.length,
    results,
    // Diagnostics — visible when opening /api/search?q=... directly in a browser.
    // `version` confirms this (question-search) build is live on the server.
    meta: {
      version: "search-v2-questions",
      scope: isAdmin ? "admin (all content)" : req.user ? "user (published + own)" : "public (published only)",
      candidateWords,
      questionsScanned,
      questionsMatched,
    },
  });
}
