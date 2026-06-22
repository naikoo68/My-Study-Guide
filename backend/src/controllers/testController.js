import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";
import Attempt from "../models/Attempt.js";

// GET /api/tests
export async function listTests(req, res) {
  const { category } = req.query;
  const filter = { status: "published" };
  if (category && category !== "All") filter.category = category;
  const tests = await TestSeries.find(filter).select("-questions").sort("-createdAt");
  res.json(tests);
}

// GET /api/tests/:id  (questions without correct answers for taking the test)
export async function getTest(req, res) {
  const test = await TestSeries.findById(req.params.id).populate({
    path: "questions",
    select: "-correct -explanation",
  });
  if (!test) return res.status(404).json({ message: "Test not found" });
  res.json(test);
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
