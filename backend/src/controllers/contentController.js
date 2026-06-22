import Subject from "../models/Subject.js";
import Session from "../models/Session.js";
import Question from "../models/Question.js";

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------------- Subjects ---------------- */

// GET /api/subjects
export async function listSubjects(req, res) {
  const subjects = await Subject.find({ isActive: true }).sort("name");
  res.json(subjects);
}

// POST /api/subjects  (admin)
export async function createSubject(req, res) {
  const { name } = req.body;
  const subject = await Subject.create({ ...req.body, slug: slugify(name) });
  res.status(201).json(subject);
}

// PUT /api/subjects/:id  (admin)
export async function updateSubject(req, res) {
  const data = { ...req.body };
  if (data.name) data.slug = slugify(data.name);
  const subject = await Subject.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!subject) return res.status(404).json({ message: "Subject not found" });
  res.json(subject);
}

// DELETE /api/subjects/:id  (admin)
export async function deleteSubject(req, res) {
  await Subject.findByIdAndDelete(req.params.id);
  res.json({ message: "Subject deleted" });
}

/* ---------------- Sessions ---------------- */

// GET /api/subjects/:subjectId/sessions
export async function listSessions(req, res) {
  const sessions = await Session.find({ subject: req.params.subjectId }).sort("index");
  res.json(sessions);
}

// POST /api/sessions  (admin)
export async function createSession(req, res) {
  const session = await Session.create(req.body);
  res.status(201).json(session);
}

// PUT /api/sessions/:id  (admin)
export async function updateSession(req, res) {
  const session = await Session.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(session);
}

// DELETE /api/sessions/:id  (admin)
export async function deleteSession(req, res) {
  await Session.findByIdAndDelete(req.params.id);
  res.json({ message: "Session deleted" });
}

/* ---------------- Questions ---------------- */

// GET /api/sessions/:sessionId/questions  (correct answer hidden for students)
export async function listQuestions(req, res) {
  const isAdmin = req.user?.role === "admin";
  const select = isAdmin ? "" : "-correct";
  const questions = await Question.find({
    session: req.params.sessionId,
    ...(isAdmin ? {} : { status: "published" }),
  }).select(select);
  res.json(questions);
}

// POST /api/questions  (admin)
export async function createQuestion(req, res) {
  const question = await Question.create(req.body);
  res.status(201).json(question);
}

// POST /api/questions/bulk  (admin) — accepts an array of questions (parsed from CSV/Excel)
export async function bulkCreateQuestions(req, res) {
  const { questions } = req.body;
  if (!Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ message: "questions array is required" });
  }
  const created = await Question.insertMany(questions, { ordered: false });
  res.status(201).json({ inserted: created.length });
}

// PUT /api/questions/:id  (admin)
export async function updateQuestion(req, res) {
  const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(question);
}

// DELETE /api/questions/:id  (admin)
export async function deleteQuestion(req, res) {
  await Question.findByIdAndDelete(req.params.id);
  res.json({ message: "Question deleted" });
}
