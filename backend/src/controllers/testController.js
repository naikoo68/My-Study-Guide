import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";
import Attempt from "../models/Attempt.js";
import User from "../models/User.js";
import { isTestVisibleToUser, findAccessEntry } from "../utils/accessControl.js";

// GET /api/tests  — list published tests visible to the requesting user
export async function listTests(req, res) {
  const { category } = req.query;
  const filter = { status: "published" };
  if (category && category !== "All") filter.category = category;
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
  const tests = await TestSeries.find().sort("-createdAt").lean();
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
    visibleToAll: test.visibleToAll !== false,
    users: users.map((u) => {
      const entry = byUser.get(String(u._id));
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        // Default to visible when there's no explicit entry.
        visible: entry ? entry.visible : true,
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

  if (Array.isArray(req.body.users)) {
    // Store an entry only when it differs from the default (visible + no expiry),
    // keeping the access array compact.
    test.access = req.body.users
      .filter((u) => u && u.user && (u.visible === false || u.validUntil))
      .map((u) => ({
        user: u.user,
        visible: u.visible !== false,
        validUntil: u.validUntil ? new Date(u.validUntil) : null,
      }));
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

  let correct = 0;
  const responses = test.questions.map((q) => {
    const chosen = answers[q._id] ?? null;
    const isCorrect = chosen === q.correct;
    if (isCorrect) correct += 1;
    return { question: q._id, chosen, isCorrect };
  });

  const attempted = Object.keys(answers).length;
  const incorrect = attempted - correct;
  const perQuestion = test.marks / test.questions.length;
  const score = correct * perQuestion - incorrect * test.negativeMarking;
  const percentage = Math.round((correct / test.questions.length) * 100);

  const attempt = await Attempt.create({
    user: req.user._id,
    type: "test",
    testSeries: test._id,
    responses,
    total: test.questions.length,
    attempted,
    correct,
    incorrect,
    score: Math.round(score),
    percentage,
    timeTaken,
  });

  await TestSeries.findByIdAndUpdate(test._id, { $inc: { attempts: 1 } });
  res.status(201).json(attempt);
}
