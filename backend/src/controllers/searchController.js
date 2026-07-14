import Stream from "../models/Stream.js";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";
import Session from "../models/Session.js";
import Quiz from "../models/Quiz.js";
import TestSeries from "../models/TestSeries.js";

// Escape user input so it is treated as a literal string inside a RegExp.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LIMIT = 8; // max results per content type

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
      adminPath: isPractice ? "/admin/practice" : "/admin/tests",
      active: t.status === "published",
    });
  }

  res.json({ query: q, count: results.length, results });
}
