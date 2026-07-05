import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";
import Attempt from "../models/Attempt.js";
import User from "../models/User.js";
import { isTestVisibleToUser, findAccessEntry } from "../utils/accessControl.js";

// GET /api/tests  — list published tests visible to the requesting user
export async function listTests(req, res) {
  const { category, post, exam } = req.query;
  const filter = { status: "published" };
  if (category && category !== "All") filter.category = category;
  if (post) filter.post = post;
  if (exam) filter.exam = exam;
  const tests = await TestSeries.find(filter).sort("-createdAt").lean();
  const enrolled = new Set((req.user?.enrolledTests || []).map(String));
  const userId = req.user?._id;
  res.json(
    tests
      .filter((t) => isTestVisibleToUser(t, userId))
      .map((t) => {
        const entry = findAccessEntry(t, userId);
        return {
          ...t,
          questionCount: t.questions?.length || 0,
          enrolled: enrolled.has(String(t._id)),
          validUntil: entry?.validUntil || null, // this user's access expiry, if any
          questions: undefined,
          access: undefined, // never expose the full access list to students
        };
      })
  );
}

// GET /api/tests/admin/all  (admin) — every test regardless of status
export async function listAllTests(req, res) {
  const filter = {};
  if (req.query.post) filter.post = req.query.post;
  const tests = await TestSeries.find(filter).sort("-createdAt").lean();
  res.json(tests.map((t) => ({ ...t, questionCount: t.questions?.length || 0, questions: undefined })));
}

// GET /api/tests/:id  (questions without correct answers for taking the test)
export async function getTest(req, res) {
  const test = await TestSeries.findById(req.params.id).populate({
    path: "questions",
    select: "-correct -explanation",
  });
  if (!test) return res.status(404).json({ message: "Test not found" });
  // Admins can always open a test; students must have access (and it must not
  // be hidden or past its validity for them).
  if (req.user?.role !== "admin" && !isTestVisibleToUser(test.toObject(), req.user?._id)) {
    return res.status(403).json({ message: "You don't have access to this test, or your access has expired." });
  }
  const obj = test.toObject();
  delete obj.access; // hide access list from students
  res.json(obj);
}

// GET /api/tests/:id/access  (admin) — all users with their access to this test
export async function getTestAccess(req, res) {
  const test = await TestSeries.findById(req.params.id).lean();
  if (!test) return res.status(404).json({ message: "Test not found" });
  const users = await User.find({ role: "student" }).select("name email").sort("name").lean();
  const byUser = new Map((test.access || []).map((a) => [String(a.user), a]));
  res.json({
    testId: test._id,
    name: test.name,
    visibleToAll: test.visibleToAll === true,
    users: users.map((u) => {
      const entry = byUser.get(String(u._id));
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        // No entry → follows the test default (hidden unless visibleToAll).
        visible: entry ? entry.visible : test.visibleToAll === true,
        validUntil: entry?.validUntil || null,
      };
    }),
  });
}

// PUT /api/tests/:id/access  (admin) — replace the access list for this test
export async function updateTestAccess(req, res) {
  const test = await TestSeries.findById(req.params.id);
  if (!test) return res.status(404).json({ message: "Test not found" });

  if (typeof req.body.visibleToAll === "boolean") test.visibleToAll = req.body.visibleToAll;
  const globalVisible = test.visibleToAll === true;

  if (Array.isArray(req.body.users)) {
    // Keep only entries that DIFFER from the test's default state (to stay
    // compact). When the test is private, that means storing the granted
    // users; when public, storing the hidden ones. Time-limits are always kept.
    test.access = req.body.users
      .filter((u) => u && u.user)
      .map((u) => ({
        user: u.user,
        visible: u.visible !== false,
        validUntil: u.validUntil ? new Date(u.validUntil) : null,
      }))
      .filter((e) => !(e.visible === globalVisible && !e.validUntil));
  }

  await test.save();
  res.json({ message: "Access updated", access: test.access, visibleToAll: test.visibleToAll });
}

// POST /api/tests  (admin)
export async function createTest(req, res) {
  const test = await TestSeries.create(req.body);
  res.status(201).json(test);
}

// PUT /api/tests/:id  (admin)
export async function updateTest(req, res) {
  const test = await TestSeries.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(test);
}

// PATCH /api/tests/:id/publish  (admin) — toggle publish/unpublish
export async function togglePublish(req, res) {
  const test = await TestSeries.findById(req.params.id);
  if (!test) return res.status(404).json({ message: "Test not found" });
  test.status = test.status === "published" ? "draft" : "published";
  await test.save();
  res.json(test);
}

// DELETE /api/tests/:id  (admin)
export async function deleteTest(req, res) {
  await TestSeries.findByIdAndDelete(req.params.id);
  res.json({ message: "Test deleted" });
}

// POST /api/tests/:id/submit — grade a submitted test attempt
export async function submitTest(req, res) {
  const { answers = {}, timeTaken = 0 } = req.body; // answers: { questionId: optionIndex }
  const test = await TestSeries.findById(req.params.id).populate("questions");
  if (!test) return res.status(404).json({ message: "Test not found" });

  const total = test.questions.length;
  let correct = 0;
  let attempted = 0;

  // Build both the stored responses and a rich review for the result screen.
  const responses = [];
  const review = test.questions.map((q) => {
    const raw = answers[q._id];
    const provided = raw !== undefined && raw !== null;
    // Both MCQ and matching are answered by picking one option index.
    const isCorrect = provided && raw === q.correct;
    if (provided) attempted += 1;
    if (isCorrect) correct += 1;
    responses.push({ question: q._id, chosen: provided ? raw : null, isCorrect });
    return {
      _id: q._id,
      type: q.type,
      text: q.text,
      image: q.image,
      options: q.options,
      columnA: q.columnA,
      columnB: q.columnB,
      correct: q.correct,
      explanation: q.explanation,
      chosen: provided ? raw : null,
      isCorrect,
    };
  });

  const skipped = total - attempted;
  const incorrect = attempted - correct;
  const perQuestion = total ? test.marks / total : 0;
  const score = Math.round(correct * perQuestion - incorrect * (test.negativeMarking || 0));
  const percentage = total ? Math.round((correct / total) * 100) : 0;

  const attempt = await Attempt.create({
    user: req.user._id,
    type: "test",
    testSeries: test._id,
    responses,
    total,
    attempted,
    correct,
    incorrect,
    score,
    percentage,
    timeTaken,
  });

  await TestSeries.findByIdAndUpdate(test._id, { $inc: { attempts: 1 } });
  // Return the graded summary + full review (with correct answers) for the UI.
  res.status(201).json({
    _id: attempt._id,
    total,
    attempted,
    skipped,
    correct,
    incorrect,
    score,
    maxScore: test.marks,
    percentage,
    timeTaken,
    review,
  });
}

/* ---------------- Test questions (admin) ---------------- */

// GET /api/tests/:id/questions  (admin) — full questions incl. correct answers
export async function getTestQuestions(req, res) {
  const questions = await Question.find({ testSeries: req.params.id }).sort("createdAt");
  res.json(questions);
}

// POST /api/tests/:id/questions  (admin) — add one question to a test
export async function addTestQuestion(req, res) {
  const test = await TestSeries.findById(req.params.id);
  if (!test) return res.status(404).json({ message: "Test not found" });
  const question = await Question.create({ ...req.body, testSeries: test._id });
  await TestSeries.findByIdAndUpdate(test._id, { $push: { questions: question._id } });
  res.status(201).json(question);
}

// DELETE /api/tests/:id/questions/:qid  (admin) — remove a question from a test
export async function deleteTestQuestion(req, res) {
  await TestSeries.findByIdAndUpdate(req.params.id, { $pull: { questions: req.params.qid } });
  await Question.findByIdAndDelete(req.params.qid);
  res.json({ message: "Question removed from test" });
}
