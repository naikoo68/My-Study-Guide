import Stream from "../models/Stream.js";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";
import Session from "../models/Session.js";
import Quiz from "../models/Quiz.js";
import Question from "../models/Question.js";
import TestSeries from "../models/TestSeries.js";
import { notifyNewContent } from "../utils/notify.js";

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------------- Streams (top level) ---------------- */

// GET /api/streams — includes subject count per stream
export async function listStreams(req, res) {
  const streams = await Stream.find({ isActive: true }).sort("order name").lean();
  const subs = await Subject.aggregate([
    { $match: { stream: { $ne: null } } },
    { $group: { _id: "$stream", count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(subs.map((s) => [String(s._id), s.count]));
  res.json(streams.map((s) => ({ ...s, subjects: map[String(s._id)] || 0 })));
}

export async function createStream(req, res) {
  const { name } = req.body;
  const stream = await Stream.create({ ...req.body, slug: slugify(name) });
  res.status(201).json(stream);
}

export async function updateStream(req, res) {
  const data = { ...req.body };
  if (data.name) data.slug = slugify(data.name);
  const stream = await Stream.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!stream) return res.status(404).json({ message: "Stream not found" });
  res.json(stream);
}

// Cascade delete: stream → its subjects → topics → sessions → quizzes → questions
export async function deleteStream(req, res) {
  const id = req.params.id;
  const subjectIds = (await Subject.find({ stream: id }).select("_id")).map((s) => s._id);
  await Promise.all([
    Question.deleteMany({ subject: { $in: subjectIds } }),
    Quiz.deleteMany({ subject: { $in: subjectIds } }),
    Session.deleteMany({ subject: { $in: subjectIds } }),
    Topic.deleteMany({ subject: { $in: subjectIds } }),
    Subject.deleteMany({ stream: id }),
    Stream.findByIdAndDelete(id),
  ]);
  res.json({ message: "Stream and all its subjects, topics, sessions, quizzes and questions deleted", subjects: subjectIds.length });
}

// GET /api/streams/:streamId/subjects — subjects in a stream, with topic counts
export async function listStreamSubjects(req, res) {
  const subjects = await Subject.find({ stream: req.params.streamId, isActive: true }).sort("name").lean();
  const topics = await Topic.aggregate([{ $group: { _id: "$subject", count: { $sum: 1 } } }]);
  const tMap = Object.fromEntries(topics.map((t) => [String(t._id), t.count]));
  res.json(subjects.map((s) => ({ ...s, topics: tMap[String(s._id)] || 0 })));
}

async function countMap(Model, matchIds, field) {
  const rows = await Model.aggregate([
    { $match: { [field]: { $in: matchIds } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
}

/* ---------------- Subjects ---------------- */

// GET /api/subjects — includes topic count per subject
export async function listSubjects(req, res) {
  const subjects = await Subject.find({ isActive: true }).sort("name").lean();
  const topics = await Topic.aggregate([{ $group: { _id: "$subject", count: { $sum: 1 } } }]);
  const tMap = Object.fromEntries(topics.map((t) => [String(t._id), t.count]));
  res.json(subjects.map((s) => ({ ...s, topics: tMap[String(s._id)] || 0 })));
}

export async function createSubject(req, res) {
  const { name } = req.body;
  const subject = await Subject.create({ ...req.body, slug: slugify(name) });
  res.status(201).json(subject);
}

export async function updateSubject(req, res) {
  const data = { ...req.body };
  if (data.name) data.slug = slugify(data.name);
  const subject = await Subject.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!subject) return res.status(404).json({ message: "Subject not found" });
  res.json(subject);
}

// Cascade delete: subject → its topics → sessions → quizzes → questions
export async function deleteSubject(req, res) {
  const id = req.params.id;
  const topicIds = (await Topic.find({ subject: id }).select("_id")).map((t) => t._id);
  await Promise.all([
    Question.deleteMany({ subject: id }),
    Quiz.deleteMany({ subject: id }),
    Session.deleteMany({ subject: id }),
    Topic.deleteMany({ subject: id }),
    Subject.findByIdAndDelete(id),
  ]);
  res.json({ message: "Subject and all its topics, sessions, quizzes and questions deleted", topics: topicIds.length });
}

/* ---------------- Topics ---------------- */

// GET /api/subjects/:subjectId/topics — includes session count per topic
export async function listTopics(req, res) {
  const topics = await Topic.find({ subject: req.params.subjectId }).sort("index").lean();
  const sMap = await countMap(Session, topics.map((t) => t._id), "topic");
  res.json(topics.map((t) => ({ ...t, sessions: sMap[String(t._id)] || 0 })));
}

export async function createTopic(req, res) {
  const topic = await Topic.create(req.body);
  res.status(201).json(topic);
}

export async function updateTopic(req, res) {
  const topic = await Topic.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  res.json(topic);
}

// Cascade delete: topic → sessions → quizzes → questions
export async function deleteTopic(req, res) {
  const id = req.params.id;
  const sessionIds = (await Session.find({ topic: id }).select("_id")).map((s) => s._id);
  await Promise.all([
    Question.deleteMany({ session: { $in: sessionIds } }),
    Quiz.deleteMany({ session: { $in: sessionIds } }),
    Session.deleteMany({ topic: id }),
    Topic.findByIdAndDelete(id),
  ]);
  res.json({ message: "Topic and its sessions, quizzes and questions deleted" });
}

/* ---------------- Sessions ---------------- */

// GET /api/topics/:topicId/sessions — includes quiz count per session
export async function listSessions(req, res) {
  const sessions = await Session.find({ topic: req.params.topicId }).sort("index").lean();
  const qMap = await countMap(Quiz, sessions.map((s) => s._id), "session");
  res.json(sessions.map((s) => ({ ...s, quizzes: qMap[String(s._id)] || 0 })));
}

export async function createSession(req, res) {
  const session = await Session.create(req.body);
  res.status(201).json(session);
}

export async function updateSession(req, res) {
  const session = await Session.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(session);
}

// Cascade delete: session → quizzes → questions
export async function deleteSession(req, res) {
  await Promise.all([
    Question.deleteMany({ session: req.params.id }),
    Quiz.deleteMany({ session: req.params.id }),
  ]);
  await Session.findByIdAndDelete(req.params.id);
  res.json({ message: "Session and its quizzes and questions deleted" });
}

/* ---------------- Quizzes (within a session) ---------------- */

// GET /api/sessions/:sessionId/quizzes — includes question count per quiz
export async function listQuizzes(req, res) {
  const quizzes = await Quiz.find({ session: req.params.sessionId }).sort("index").lean();
  const qMap = await countMap(Question, quizzes.map((q) => q._id), "quiz");
  res.json(quizzes.map((q) => ({ ...q, questions: qMap[String(q._id)] || 0 })));
}

export async function createQuiz(req, res) {
  const quiz = await Quiz.create(req.body);
  notifyNewContent("quiz", quiz.title); // fire-and-forget (respects admin toggle)
  res.status(201).json(quiz);
}

export async function updateQuiz(req, res) {
  const quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  res.json(quiz);
}

// Cascade delete: quiz → questions
export async function deleteQuiz(req, res) {
  await Question.deleteMany({ quiz: req.params.id });
  await Quiz.findByIdAndDelete(req.params.id);
  res.json({ message: "Quiz and its questions deleted" });
}

// GET /api/quizzes/:quizId/questions — practice questions (with answers)
export async function listQuizQuestions(req, res) {
  // Block students whose quiz access was disabled by an admin.
  if (req.user && req.user.role !== "admin" && req.user.quizAccess === false) {
    return res.status(403).json({ message: "Quiz access has been disabled for your account." });
  }
  const isAdmin = req.user?.role === "admin";
  const questions = await Question.find({
    quiz: req.params.quizId,
    ...(isAdmin ? {} : { status: "published" }),
  });
  res.json(questions);
}

/* ---------------- Questions ---------------- */

// GET /api/sessions/:sessionId/questions
// Quizzes are practice with instant feedback, so the correct answer and
// explanation are returned. (Graded tests hide the answer — see testController.)
export async function listQuestions(req, res) {
  const isAdmin = req.user?.role === "admin";
  const questions = await Question.find({
    session: req.params.sessionId,
    ...(isAdmin ? {} : { status: "published" }),
  });
  res.json(questions);
}

// GET /api/questions  (admin) — list all questions with subject/session names
export async function listAllQuestions(req, res) {
  const questions = await Question.find()
    .sort("-createdAt")
    .limit(500)
    .populate("subject", "name")
    .populate("session", "title")
    .populate("quiz", "title")
    .lean();
  res.json(
    questions.map((q) => ({
      ...q,
      subject: q.subject?.name || "—",
      session: q.session?.title || "—",
      quiz: q.quiz?.title || "—",
    }))
  );
}

export async function createQuestion(req, res) {
  const question = await Question.create(req.body);
  res.status(201).json(question);
}

// POST /api/questions/bulk
// Body: { questions: [...], context: { subject, session, quiz, testSeries, status } }
// The context is merged into every question so the client only sends the
// per-question fields (text, options, correct, …). Test-series questions are
// also linked into that test's question list.
export async function bulkCreateQuestions(req, res) {
  const { questions, context = {} } = req.body;
  if (!Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ message: "questions array is required" });
  }
  const docs = questions.map((q) => ({ status: "published", ...q, ...context }));
  const created = await Question.insertMany(docs, { ordered: false });

  // Attach to the test series' question list when uploading test questions.
  if (context.testSeries) {
    await TestSeries.findByIdAndUpdate(context.testSeries, {
      $push: { questions: { $each: created.map((c) => c._id) } },
    });
  }
  res.status(201).json({ inserted: created.length });
}

export async function updateQuestion(req, res) {
  const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(question);
}

export async function deleteQuestion(req, res) {
  await Question.findByIdAndDelete(req.params.id);
  res.json({ message: "Question deleted" });
}
