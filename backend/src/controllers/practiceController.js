import PracticeStream from "../models/PracticeStream.js";
import PracticeSubject from "../models/PracticeSubject.js";
import PracticeTopic from "../models/PracticeTopic.js";
import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";
import { isTestVisibleToUser } from "../utils/accessControl.js";
import { ownerFilter, ownerValue } from "../utils/ownership.js";
import { duplicateQuestions } from "../utils/duplicateQuestions.js";

// True when the caller owns this document (or is an admin working in the shared
// space). Used to guard edits/plays of a specific record.
const owns = (req, doc) =>
  req.user?.role === "client"
    ? String(doc?.owner || "") === String(req.user._id)
    : !doc?.owner; // admin space = ownerless content

// "Practice Quizzes" section. Items (My Quiz / My Test Series) are stored as
// TestSeries documents with practice=true, so they reuse the existing question
// management, per-student visibility and attempt/grading engine. They are
// hidden by default (visibleToAll:false) and never trigger notifications.

const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------------- Streams (admin) ---------------- */
export async function listStreams(req, res) {
  const filter = { isActive: true, ...ownerFilter(req) };
  if (req.query.kind) filter.kind = req.query.kind;
  const streams = await PracticeStream.find(filter).sort("order name").lean();
  const streamIds = streams.map((s) => s._id);
  const subs = await PracticeSubject.aggregate([
    { $match: { stream: { $in: streamIds } } },
    { $group: { _id: "$stream", count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(subs.map((s) => [String(s._id), s.count]));
  res.json(streams.map((s) => ({ ...s, subjects: map[String(s._id)] || 0 })));
}
export async function createStream(req, res) {
  const s = await PracticeStream.create({ ...req.body, slug: slugify(req.body.name), owner: ownerValue(req) });
  res.status(201).json(s);
}
export async function updateStream(req, res) {
  const d = { ...req.body };
  if (d.name) d.slug = slugify(d.name);
  delete d.owner; // never reassign ownership from the client
  const s = await PracticeStream.findOneAndUpdate({ _id: req.params.id, ...ownerFilter(req) }, d, { new: true });
  if (!s) return res.status(404).json({ message: "Stream not found" });
  res.json(s);
}
export async function deleteStream(req, res) {
  const id = req.params.id;
  const stream = await PracticeStream.findOne({ _id: id, ...ownerFilter(req) });
  if (!stream) return res.status(404).json({ message: "Stream not found" });
  const items = await TestSeries.find({ practice: true, practiceStream: id }).select("questions");
  const qIds = items.flatMap((i) => i.questions || []);
  const subjectIds = (await PracticeSubject.find({ stream: id }).select("_id")).map((s) => s._id);
  await Promise.all([
    Question.deleteMany({ _id: { $in: qIds } }),
    TestSeries.deleteMany({ practice: true, practiceStream: id }),
    PracticeTopic.deleteMany({ subject: { $in: subjectIds } }),
    PracticeSubject.deleteMany({ stream: id }),
    PracticeStream.findByIdAndDelete(id),
  ]);
  res.json({ message: "Practice stream and all its content deleted" });
}

/* ---------------- Subjects (admin) ---------------- */
export async function listSubjects(req, res) {
  const subjects = await PracticeSubject.find({ stream: req.params.streamId, isActive: true, ...ownerFilter(req) }).sort("order name").lean();
  const subjectIds = subjects.map((s) => s._id);
  const items = await TestSeries.aggregate([
    { $match: { practice: true, practiceSubject: { $in: subjectIds } } },
    { $group: { _id: "$practiceSubject", count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(items.map((i) => [String(i._id), i.count]));
  res.json(subjects.map((s) => ({ ...s, items: map[String(s._id)] || 0 })));
}
export async function createSubject(req, res) {
  const s = await PracticeSubject.create({ ...req.body, slug: slugify(req.body.name), owner: ownerValue(req) });
  res.status(201).json(s);
}
// GET /api/practice/all-subjects — flat list of every practice subject (for the
// "Add from Practice" picker when composing a test).
export async function allSubjects(req, res) {
  const subs = await PracticeSubject.find({ isActive: true, ...ownerFilter(req) })
    .populate("stream", "name kind")
    .sort("name")
    .lean();
  res.json(
    subs.map((s) => ({
      _id: s._id,
      name: s.name,
      stream: s.stream?.name || "",
      kind: s.stream?.kind || "",
    }))
  );
}
export async function updateSubject(req, res) {
  const d = { ...req.body };
  if (d.name) d.slug = slugify(d.name);
  delete d.owner;
  const s = await PracticeSubject.findOneAndUpdate({ _id: req.params.id, ...ownerFilter(req) }, d, { new: true });
  if (!s) return res.status(404).json({ message: "Subject not found" });
  res.json(s);
}
export async function deleteSubject(req, res) {
  const id = req.params.id;
  const subject = await PracticeSubject.findOne({ _id: id, ...ownerFilter(req) });
  if (!subject) return res.status(404).json({ message: "Subject not found" });
  const items = await TestSeries.find({ practice: true, practiceSubject: id }).select("questions");
  const qIds = items.flatMap((i) => i.questions || []);
  await Promise.all([
    Question.deleteMany({ _id: { $in: qIds } }),
    TestSeries.deleteMany({ practice: true, practiceSubject: id }),
    PracticeTopic.deleteMany({ subject: id }),
    PracticeSubject.findByIdAndDelete(id),
  ]);
  res.json({ message: "Practice subject and all its items deleted" });
}

/* ---------------- Topics (admin) — My Quiz only ---------------- */
export async function listTopics(req, res) {
  const topics = await PracticeTopic.find({ subject: req.params.subjectId, isActive: true, ...ownerFilter(req) }).sort("order name").lean();
  const topicIds = topics.map((t) => t._id);
  const items = await TestSeries.aggregate([
    { $match: { practice: true, practiceTopic: { $in: topicIds } } },
    { $group: { _id: "$practiceTopic", count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(items.map((i) => [String(i._id), i.count]));
  res.json(topics.map((t) => ({ ...t, items: map[String(t._id)] || 0 })));
}
export async function createTopic(req, res) {
  const t = await PracticeTopic.create({ ...req.body, slug: slugify(req.body.name), owner: ownerValue(req) });
  res.status(201).json(t);
}
export async function updateTopic(req, res) {
  const d = { ...req.body };
  if (d.name) d.slug = slugify(d.name);
  delete d.owner;
  const t = await PracticeTopic.findOneAndUpdate({ _id: req.params.id, ...ownerFilter(req) }, d, { new: true });
  if (!t) return res.status(404).json({ message: "Topic not found" });
  res.json(t);
}
// PATCH /api/practice/topics/:id/move — move a My Quiz topic to another subject
// (within My Quiz). Its quizzes move with it (their stream/subject are updated
// to the destination; the topic id stays the same).
export async function moveTopic(req, res) {
  const topic = await PracticeTopic.findOne({ _id: req.params.id, ...ownerFilter(req) });
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  const destSubject = await PracticeSubject.findOne({ _id: req.body?.subject, ...ownerFilter(req) });
  if (!destSubject) return res.status(400).json({ message: "Choose a destination subject." });
  topic.subject = destSubject._id;
  await topic.save();
  // Relocate the topic's quizzes to the destination stream/subject.
  await TestSeries.updateMany(
    { practice: true, practiceTopic: topic._id, ...ownerFilter(req) },
    { $set: { practiceSubject: destSubject._id, practiceStream: destSubject.stream } }
  );
  res.json({ message: "Topic moved", _id: topic._id });
}

export async function deleteTopic(req, res) {
  const id = req.params.id;
  const topic = await PracticeTopic.findOne({ _id: id, ...ownerFilter(req) });
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  const items = await TestSeries.find({ practice: true, practiceTopic: id }).select("questions");
  const qIds = items.flatMap((i) => i.questions || []);
  await Promise.all([
    Question.deleteMany({ _id: { $in: qIds } }),
    TestSeries.deleteMany({ practice: true, practiceTopic: id }),
    PracticeTopic.findByIdAndDelete(id),
  ]);
  res.json({ message: "Practice topic and all its quizzes deleted" });
}

/* ---------------- Items (admin) — items are practice TestSeries ---------------- */
// My Test Series: items live directly under a subject.
export async function listItems(req, res) {
  const filter = { practice: true, practiceSubject: req.params.subjectId, ...ownerFilter(req) };
  if (req.query.kind) filter.practiceKind = req.query.kind;
  const items = await TestSeries.find(filter).sort("createdAt").lean();
  res.json(items.map((t) => ({ ...t, questionCount: t.questions?.length || 0, questions: undefined })));
}
// My Quiz: items live under a topic.
export async function listTopicItems(req, res) {
  const items = await TestSeries.find({ practice: true, practiceTopic: req.params.topicId, ...ownerFilter(req) }).sort("createdAt").lean();
  res.json(items.map((t) => ({ ...t, questionCount: t.questions?.length || 0, questions: undefined })));
}
export async function createItem(req, res) {
  const { name, practiceStream, practiceSubject, practiceTopic, practiceKind = "quiz", duration = 15, marks = 0, difficulty = "Medium", subjectPlan } = req.body;
  const item = await TestSeries.create({
    name,
    owner: ownerValue(req),
    practice: true,
    practiceKind,
    practiceStream,
    practiceSubject,
    practiceTopic: practiceKind === "quiz" ? practiceTopic : undefined,
    category: "Full-Length", // required by schema; unused for practice
    duration,
    marks,
    difficulty,
    // Manual subject blueprint (subject name + planned question count) — drives
    // the subject-based question manager and its per-subject limits.
    subjectPlan: Array.isArray(subjectPlan) ? subjectPlan : [],
    status: "published",
    visibleToAll: false, // hidden by default — admin grants access per student
  });
  res.status(201).json(item);
}

// PATCH /api/practice/items/:id — update a practice item's editable fields
// (name + the remembered AI topic/subtopics). Owner-scoped.
export async function updateItem(req, res) {
  const item = await TestSeries.findOne({ _id: req.params.id, practice: true, ...ownerFilter(req) });
  if (!item) return res.status(404).json({ message: "Item not found" });
  const { name, aiTopic, aiSubtopics } = req.body;
  if (typeof name === "string" && name.trim()) item.name = name.trim();
  if (typeof aiTopic === "string") item.aiTopic = aiTopic;
  if (typeof aiSubtopics === "string") item.aiSubtopics = aiSubtopics;
  await item.save();
  res.json(item);
}

// PATCH /api/practice/items/:id/move — relocate a practice item (My Quiz / My
// Test) to a different Stream → Subject → (Topic). Owner-scoped.
export async function moveItem(req, res) {
  const item = await TestSeries.findOne({ _id: req.params.id, practice: true, ...ownerFilter(req) });
  if (!item) return res.status(404).json({ message: "Item not found" });
  const { practiceStream, practiceSubject, practiceTopic, copy } = req.body;
  const stream = await PracticeStream.findOne({ _id: practiceStream, ...ownerFilter(req) });
  if (!stream) return res.status(400).json({ message: "Choose a target stream." });
  if (stream.kind && stream.kind !== item.practiceKind) {
    return res.status(400).json({ message: `Pick a ${item.practiceKind === "quiz" ? "My Quiz" : "My Test"} stream.` });
  }
  const subject = await PracticeSubject.findOne({ _id: practiceSubject, stream: stream._id, ...ownerFilter(req) });
  if (!subject) return res.status(400).json({ message: "Choose a subject in that stream." });
  let topicId;
  if (item.practiceKind === "quiz") {
    const topic = await PracticeTopic.findOne({ _id: practiceTopic, subject: subject._id, ...ownerFilter(req) });
    if (!topic) return res.status(400).json({ message: "Choose a topic in that subject." });
    topicId = topic._id;
  }

  if (copy) {
    const newItem = await TestSeries.create({
      name: `${item.name} (copy)`,
      owner: ownerValue(req),
      practice: true,
      practiceKind: item.practiceKind,
      practiceStream: stream._id,
      practiceSubject: subject._id,
      practiceTopic: topicId,
      category: item.category || "Full-Length",
      duration: item.duration,
      marks: item.marks,
      difficulty: item.difficulty,
      status: item.status || "published",
      visibleToAll: false,
    });
    const created = await duplicateQuestions({ testSeries: item._id }, { testSeries: newItem._id, owner: ownerValue(req) });
    if (created.length) await TestSeries.findByIdAndUpdate(newItem._id, { $push: { questions: { $each: created.map((c) => c._id) } } });
    return res.json({ message: "Copied", _id: newItem._id });
  }

  item.practiceStream = stream._id;
  item.practiceSubject = subject._id;
  item.practiceTopic = topicId;
  await item.save();
  res.json({ message: "Migrated", _id: item._id });
}

// POST /api/practice/items/:id/split  { perQuiz }
// Split ONE practice quiz item's questions into multiple quiz items of `perQuiz`
// each. The original keeps the first chunk (renamed "Quiz 1"); the rest go into
// new items "Quiz 2".."Quiz N" under the same topic. Owner-scoped (covers client
// quizzes). e.g. 300 questions at 50/quiz → Quiz 1..Quiz 6.
export async function splitItem(req, res) {
  const per = Math.max(1, Math.min(500, parseInt(req.body?.perQuiz, 10) || 50));
  const item = await TestSeries.findOne({ _id: req.params.id, practice: true, practiceKind: "quiz", ...ownerFilter(req) });
  if (!item) return res.status(404).json({ message: "Quiz not found" });

  const qids = (item.questions || []).map((q) => q);
  const total = qids.length;
  if (total <= per) {
    return res.json({ message: `No split needed — this quiz has ${total} question(s) (≤ ${per}).`, quizzes: 1, created: 0 });
  }

  const chunks = [];
  for (let i = 0; i < total; i += per) chunks.push(qids.slice(i, i + per));

  // Original item becomes "Quiz 1" and keeps the first chunk.
  item.name = "Quiz 1";
  item.questions = chunks[0];
  await item.save();

  for (let k = 1; k < chunks.length; k++) {
    const newItem = await TestSeries.create({
      name: `Quiz ${k + 1}`,
      owner: ownerValue(req),
      practice: true,
      practiceKind: "quiz",
      practiceStream: item.practiceStream,
      practiceSubject: item.practiceSubject,
      practiceTopic: item.practiceTopic,
      category: item.category || "Full-Length",
      duration: item.duration,
      marks: item.marks,
      difficulty: item.difficulty,
      status: "published",
      visibleToAll: false,
      questions: chunks[k],
    });
    // Point each moved question at its new item.
    await Question.updateMany({ _id: { $in: chunks[k] } }, { $set: { testSeries: newItem._id } });
  }
  res.json({ message: `Split ${total} questions into ${chunks.length} quizzes.`, quizzes: chunks.length, created: chunks.length - 1 });
}

// POST /api/practice/topics/:id/split  { perQuiz }
// Split ALL questions in a My-Quiz topic (across its quiz items) into quiz items
// of `perQuiz` each, named "Quiz 1".."Quiz N". The topic's old items are replaced
// (questions preserved). Owner-scoped. e.g. 200 questions at 50/quiz → Quiz 1..4.
export async function splitTopic(req, res) {
  const per = Math.max(1, Math.min(500, parseInt(req.body?.perQuiz, 10) || 50));
  const topic = await PracticeTopic.findOne({ _id: req.params.id, ...ownerFilter(req) });
  if (!topic) return res.status(404).json({ message: "Topic not found" });

  const items = await TestSeries.find({ practice: true, practiceKind: "quiz", practiceTopic: topic._id, ...ownerFilter(req) }).sort("createdAt");
  if (!items.length) return res.json({ message: "This topic has no quizzes yet.", quizzes: 0, created: 0 });

  const allQids = items.flatMap((i) => i.questions || []);
  const total = allQids.length;
  if (!total) return res.json({ message: "This topic has no questions yet.", quizzes: 0, created: 0 });

  const ctx = {
    practiceStream: items[0].practiceStream,
    practiceSubject: items[0].practiceSubject,
    practiceTopic: topic._id,
  };

  // Remove the topic's existing quiz items (their questions are preserved and
  // reassigned to the fresh items below).
  await TestSeries.deleteMany({ _id: { $in: items.map((i) => i._id) } });

  const chunks = [];
  for (let i = 0; i < total; i += per) chunks.push(allQids.slice(i, i + per));

  for (let k = 0; k < chunks.length; k++) {
    const newItem = await TestSeries.create({
      name: `Quiz ${k + 1}`,
      owner: ownerValue(req),
      practice: true,
      practiceKind: "quiz",
      ...ctx,
      category: "Full-Length",
      duration: 15,
      marks: 0,
      difficulty: "Medium",
      status: "published",
      visibleToAll: false,
      questions: chunks[k],
    });
    await Question.updateMany({ _id: { $in: chunks[k] } }, { $set: { testSeries: newItem._id } });
  }
  res.json({ message: `Split ${total} questions into ${chunks.length} quizzes.`, quizzes: chunks.length, created: chunks.length });
}

// GET /api/practice/quiz/:id/play — full questions WITH answers, so a "My Quiz"
// practice quiz can reveal correctness instantly (like the regular Quiz).
// Restricted to practice items of kind "quiz" that are visible to the user, so
// this never leaks answers for real tests or My-Test-Series items.
export async function playQuiz(req, res) {
  const item = await TestSeries.findById(req.params.id).populate("questions");
  if (!item || !item.practice || item.practiceKind !== "quiz") {
    return res.status(404).json({ message: "Practice quiz not found" });
  }
  // Admin, the owning client, or a student the item is shared with may play it.
  if (req.user?.role !== "admin" && !owns(req, item) && !isTestVisibleToUser(item.toObject(), req.user?._id)) {
    return res.status(403).json({ message: "You don't have access to this quiz." });
  }
  const obj = item.toObject();
  res.json({
    _id: obj._id,
    name: obj.name,
    duration: obj.duration,
    difficulty: obj.difficulty,
    questionCount: obj.questions.length,
    questions: obj.questions, // includes correct / explanation / optionExplanations
  });
}

// GET /api/practice/my-items — list of the caller's OWN practice items (both
// My Quiz and My Test). Each item carries its Stream → Subject → Topic context
// so the client dashboard can present a drill-down browser:
//   My Quiz : Stream → Subject → Topic → Quiz
//   My Test : Stream → Test
const nodeInfo = (n) => (n ? { _id: n._id, name: n.name, icon: n.icon, color: n.color } : null);
export async function myItems(req, res) {
  const items = await TestSeries.find({ practice: true, ...ownerFilter(req) })
    .populate("practiceStream", "name icon color")
    .populate("practiceSubject", "name icon color")
    .populate("practiceTopic", "name icon color")
    .sort("createdAt")
    .lean();
  res.json(
    items.map((t) => ({
      _id: t._id,
      name: t.name,
      kind: t.practiceKind,
      duration: t.duration,
      marks: t.marks,
      difficulty: t.difficulty,
      questionCount: t.questions?.length || 0,
      // The manual subject blueprint (GK, Accountancy, …) so the "Add to test"
      // picker can offer the test's sub-subjects/sections.
      subjectPlan: Array.isArray(t.subjectPlan) ? t.subjectPlan : [],
      stream: nodeInfo(t.practiceStream),
      subject: nodeInfo(t.practiceSubject),
      topic: nodeInfo(t.practiceTopic),
    }))
  );
}

/* ---------------- Student browse (visibility-filtered) ---------------- */
export async function browseStreams(req, res) {
  const items = await TestSeries.find({ practice: true, practiceKind: req.params.kind, status: "published", owner: null })
    .select("practiceStream visibleToAll access")
    .lean();
  const ok = new Set(items.filter((t) => isTestVisibleToUser(t, req.user?._id)).map((t) => String(t.practiceStream)));
  const streams = await PracticeStream.find({ isActive: true, kind: req.params.kind, owner: null }).sort("order name").lean();
  res.json(streams.filter((s) => ok.has(String(s._id))));
}
export async function browseSubjects(req, res) {
  const { kind, streamId } = req.params;
  const items = await TestSeries.find({ practice: true, practiceKind: kind, status: "published", practiceStream: streamId, owner: null })
    .select("practiceSubject visibleToAll access")
    .lean();
  const ok = new Set(items.filter((t) => isTestVisibleToUser(t, req.user?._id)).map((t) => String(t.practiceSubject)));
  const subjects = await PracticeSubject.find({ stream: streamId, isActive: true, owner: null }).sort("order name").lean();
  res.json(subjects.filter((s) => ok.has(String(s._id))));
}
// My Test Series: items under subject.
export async function browseItems(req, res) {
  const { kind, subjectId } = req.params;
  const items = await TestSeries.find({ practice: true, practiceKind: kind, status: "published", practiceSubject: subjectId, owner: null })
    .sort("createdAt")
    .lean();
  res.json(
    items
      .filter((t) => isTestVisibleToUser(t, req.user?._id))
      .map((t) => ({ _id: t._id, name: t.name, duration: t.duration, marks: t.marks, difficulty: t.difficulty, questionCount: t.questions?.length || 0 }))
  );
}
// My Quiz: topics under a subject that contain visible quizzes.
export async function browseTopics(req, res) {
  const { subjectId } = req.params;
  const items = await TestSeries.find({ practice: true, practiceKind: "quiz", status: "published", practiceSubject: subjectId, owner: null })
    .select("practiceTopic visibleToAll access")
    .lean();
  const ok = new Set(items.filter((t) => isTestVisibleToUser(t, req.user?._id)).map((t) => String(t.practiceTopic)));
  const topics = await PracticeTopic.find({ subject: subjectId, isActive: true, owner: null }).sort("order name").lean();
  res.json(topics.filter((t) => ok.has(String(t._id))));
}
// My Quiz: quizzes under a topic.
export async function browseTopicItems(req, res) {
  const items = await TestSeries.find({ practice: true, practiceKind: "quiz", status: "published", practiceTopic: req.params.topicId, owner: null })
    .sort("createdAt")
    .lean();
  res.json(
    items
      .filter((t) => isTestVisibleToUser(t, req.user?._id))
      .map((t) => ({ _id: t._id, name: t.name, duration: t.duration, marks: t.marks, difficulty: t.difficulty, questionCount: t.questions?.length || 0 }))
  );
}
