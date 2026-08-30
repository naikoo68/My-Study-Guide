import Exam from "../models/Exam.js";
import ExamPost from "../models/ExamPost.js";
import TestSeries from "../models/TestSeries.js";
import PracticeExam from "../models/PracticeExam.js";
import PracticeStream from "../models/PracticeStream.js";
import { softDeletePatch } from "../utils/softDelete.js";

// Count documents grouped by a reference field, returned as { id: count }.
async function countBy(Model, ids, field) {
  if (!ids.length) return {};
  const rows = await Model.aggregate([
    { $match: { [field]: { $in: ids } } },
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
  ]);
  const map = {};
  rows.forEach((r) => { map[String(r._id)] = r.n; });
  return map;
}

/* ---------------- Exams ---------------- */

// GET /api/exams — public "browse by exam" hub. Returns BOTH:
//   • main Exams (grouped public test series) → link to /exams/:slug, and
//   • My-Quiz PRACTICE exams (e.g. "Finance Account Assistant") that contain
//     published quizzes → link to the practice browser.
// So a practice exam the admin adds shows up here too, not only under My Quiz.
export async function listExams(req, res) {
  const exams = await Exam.find().sort("order name").lean();
  const map = await countBy(ExamPost, exams.map((e) => e._id), "exam");
  const mainExams = exams.map((e) => ({ ...e, posts: map[String(e._id)] || 0 }));

  // Platform (owner:null) practice exams that are live and hold ≥1 published,
  // non-disabled quiz — and whose parent stream isn't disabled.
  const pExams = await PracticeExam.find({ owner: null, isActive: true, disabled: { $ne: true } }).sort("order name").lean();
  let practiceExams = [];
  if (pExams.length) {
    const streamIds = [...new Set(pExams.map((e) => String(e.stream)).filter(Boolean))];
    const streams = await PracticeStream.find({ _id: { $in: streamIds } }).select("disabled isActive").lean();
    const streamOk = new Map(streams.map((s) => [String(s._id), s.disabled !== true && s.isActive !== false]));
    const counts = await countBy2(
      pExams.map((e) => e._id),
      { practice: true, practiceKind: "quiz", status: "published", disabled: { $ne: true }, owner: null },
      "practiceExam"
    );
    practiceExams = pExams
      .filter((e) => streamOk.get(String(e.stream)) && (counts[String(e._id)] || 0) > 0)
      .map((e) => ({
        _id: e._id,
        name: e.name,
        description: e.description,
        practice: true, // frontend links these to the practice browser
        stream: e.stream, // needed to build /practice/quiz/:stream/:exam
        quizzes: counts[String(e._id)] || 0,
      }));
  }

  res.json([...mainExams, ...practiceExams]);
}

// Like countBy but with an extra base filter (used for published-quiz counts).
async function countBy2(ids, baseFilter, field) {
  if (!ids.length) return {};
  const rows = await TestSeries.aggregate([
    { $match: { ...baseFilter, [field]: { $in: ids } } },
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
  ]);
  const map = {};
  rows.forEach((r) => { map[String(r._id)] = r.n; });
  return map;
}

export async function createExam(req, res) {
  res.status(201).json(await Exam.create(req.body));
}

export async function updateExam(req, res) {
  const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!exam) return res.status(404).json({ message: "Exam not found" });
  res.json(exam);
}

// Delete an exam → soft delete to the Recycle Bin. Only the exam itself is
// flagged; its posts and tests are left untouched (hidden with it, restored
// with it). Permanent deletion from the Recycle Bin runs the real cascade.
export async function deleteExam(req, res) {
  await Exam.findByIdAndUpdate(req.params.id, softDeletePatch());
  res.json({ message: "Exam and its posts deleted" });
}

/* ---------------- Posts (sub-sections) ---------------- */

// GET /api/exams/:examId/posts — with test counts
export async function listPosts(req, res) {
  const posts = await ExamPost.find({ exam: req.params.examId }).sort("order name").lean();
  const map = await countBy(TestSeries, posts.map((p) => p._id), "post");
  res.json(posts.map((p) => ({ ...p, tests: map[String(p._id)] || 0 })));
}

export async function createPost(req, res) {
  res.status(201).json(await ExamPost.create(req.body));
}

export async function updatePost(req, res) {
  const post = await ExamPost.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!post) return res.status(404).json({ message: "Post not found" });
  res.json(post);
}

// Delete a post → soft delete to the Recycle Bin. The post is flagged; its
// tests are left linked and untouched so a restore brings it back intact.
export async function deletePost(req, res) {
  await ExamPost.findByIdAndUpdate(req.params.id, softDeletePatch());
  res.json({ message: "Post deleted" });
}
