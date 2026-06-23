import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";
import Session from "../models/Session.js";
import Question from "../models/Question.js";

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

// Cascade delete: subject → its topics → sessions → questions
export async function deleteSubject(req, res) {
  const id = req.params.id;
  const topicIds = (await Topic.find({ subject: id }).select("_id")).map((t) => t._id);
  const sessionIds = (await Session.find({ subject: id }).select("_id")).map((s) => s._id);
  await Promise.all([
    Question.deleteMany({ session: { $in: sessionIds } }),
    Session.deleteMany({ subject: id }),
    Topic.deleteMany({ subject: id }),
    Subject.findByIdAndDelete(id),
  ]);
  res.json({ message: "Subject and all its topics, sessions and questions deleted", topics: topicIds.length });
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

// Cascade delete: topic → sessions → questions
export async function deleteTopic(req, res) {
  const id = req.params.id;
  const sessionIds = (await Session.find({ topic: id }).select("_id")).map((s) => s._id);
  await Promise.all([
    Question.deleteMany({ session: { $in: sessionIds } }),
    Session.deleteMany({ topic: id }),
    Topic.findByIdAndDelete(id),
  ]);
  res.json({ message: "Topic and its sessions and questions deleted" });
}

/* ---------------- Sessions ---------------- */

// GET /api/topics/:topicId/sessions — includes question count per session
export async function listSessions(req, res) {
  const sessions = await Session.find({ topic: req.params.topicId }).sort("index").lean();
  const qMap = await countMap(Question, sessions.map((s) => s._id), "session");
  res.json(sessions.map((s) => ({ ...s, questions: qMap[String(s._id)] || 0 })));
}

export async function createSession(req, res) {
  const session = await Session.create(req.body);
  res.status(201).json(session);
}

export async function updateSession(req, res) {
  const session = await Session.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(session);
}

// Cascade delete: session → questions
export async function deleteSession(req, res) {
  await Question.deleteMany({ session: req.params.id });
  await Session.findByIdAndDelete(req.params.id);
  res.json({ message: "Session and its questions deleted" });
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
    .lean();
  res.json(
    questions.map((q) => ({
      ...q,
      subject: q.subject?.name || "—",
      session: q.session?.title || "—",
    }))
  );
}

export async function createQuestion(req, res) {
  const question = await Question.create(req.body);
  res.status(201).json(question);
}

export async function bulkCreateQuestions(req, res) {
  const { questions } = req.body;
  if (!Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ message: "questions array is required" });
  }
  const created = await Question.insertMany(questions, { ordered: false });
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
