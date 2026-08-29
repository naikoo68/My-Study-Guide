// Recycle Bin for the admin content library.
//
// Deletes across the content tree (Stream → Subject → Topic → Session → Quiz →
// Question) are SOFT: the item is flagged `deleted: true` and hidden from every
// normal list, but kept in the database. This controller powers the Recycle Bin
// UI: list the soft-deleted items, RESTORE one (un-flag it — its whole subtree
// comes back because children were never flagged), or PERMANENTLY DELETE one
// (the real cascade removal that can't be undone).

import Stream from "../models/Stream.js";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";
import Session from "../models/Session.js";
import Quiz from "../models/Quiz.js";
import Question from "../models/Question.js";
import TestSeries from "../models/TestSeries.js";
import Notice from "../models/Notice.js";
import Message from "../models/Message.js";
import Review from "../models/Review.js";
import Coupon from "../models/Coupon.js";
import Document from "../models/Document.js";
import Feedback from "../models/Feedback.js";
import Exam from "../models/Exam.js";
import ExamPost from "../models/ExamPost.js";
import CbtRegistration from "../models/CbtRegistration.js";
import AiKey from "../models/AiKey.js";
import Institution from "../models/Institution.js";
import SmSubject from "../models/SmSubject.js";
import SmClass from "../models/SmClass.js";
import SmFile from "../models/SmFile.js";
import PracticeStream from "../models/PracticeStream.js";
import PracticeSubject from "../models/PracticeSubject.js";
import PracticeTopic from "../models/PracticeTopic.js";
import { ONLY_DELETED, restorePatch } from "../utils/softDelete.js";

// Reads inside cascades must include soft-deleted docs, so bypass the auto-hide.
const withDeleted = (q) => q.setOptions({ withDeleted: true });

// Map a "type" key from the client to its model + friendly label. Content-tree
// types cascade on permanent delete; `flat: true` types are standalone records
// (no children) that simply remove themselves.
const TYPES = {
  stream: { Model: Stream, label: "Stream" },
  subject: { Model: Subject, label: "Subject" },
  topic: { Model: Topic, label: "Topic" },
  session: { Model: Session, label: "Session" },
  quiz: { Model: Quiz, label: "Quiz" },
  question: { Model: Question, label: "Question" },
  notice: { Model: Notice, label: "Notice", flat: true },
  message: { Model: Message, label: "Message", flat: true },
  review: { Model: Review, label: "Review", flat: true },
  coupon: { Model: Coupon, label: "Coupon", flat: true },
  document: { Model: Document, label: "Document", flat: true },
  feedback: { Model: Feedback, label: "Feedback", flat: true },

  // Standalone / leaf records — permanent delete just removes the one record.
  cbtregistration: { Model: CbtRegistration, label: "Exam registration", flat: true },
  aikey: { Model: AiKey, label: "API key", flat: true },
  smfile: { Model: SmFile, label: "Study file", flat: true },

  // Test series — permanent delete also removes its questions.
  testseries: {
    Model: TestSeries, label: "Test Series",
    cascade: async (id) => {
      const t = await withDeleted(TestSeries.findById(id).select("questions"));
      if (t?.questions?.length) await Question.deleteMany({ _id: { $in: t.questions } });
      await TestSeries.findByIdAndDelete(id);
    },
  },

  // Exams → remove posts and detach (keep) their tests.
  exam: {
    Model: Exam, label: "Exam",
    cascade: async (id) => {
      await Promise.all([
        ExamPost.deleteMany({ exam: id }),
        TestSeries.updateMany({ exam: id }, { $unset: { exam: "", post: "" } }),
        Exam.findByIdAndDelete(id),
      ]);
    },
  },
  exampost: {
    Model: ExamPost, label: "Exam section",
    cascade: async (id) => {
      await TestSeries.updateMany({ post: id }, { $unset: { post: "" } });
      await ExamPost.findByIdAndDelete(id);
    },
  },

  // Study Material tree.
  institution: {
    Model: Institution, label: "Study institution",
    cascade: async (id) => {
      await Promise.all([
        SmFile.deleteMany({ institution: id }),
        SmClass.deleteMany({ institution: id }),
        SmSubject.deleteMany({ institution: id }),
        Institution.findByIdAndDelete(id),
      ]);
    },
  },
  smsubject: {
    Model: SmSubject, label: "Study subject",
    cascade: async (id) => {
      await Promise.all([
        SmFile.deleteMany({ subject: id }),
        SmClass.deleteMany({ subject: id }),
        SmSubject.findByIdAndDelete(id),
      ]);
    },
  },
  smclass: {
    Model: SmClass, label: "Study class",
    cascade: async (id) => {
      await Promise.all([SmFile.deleteMany({ smClass: id }), SmClass.findByIdAndDelete(id)]);
    },
  },

  // Practice tree — permanent delete also removes practice items + questions.
  practicestream: {
    Model: PracticeStream, label: "Practice stream",
    cascade: async (id) => {
      const items = await withDeleted(TestSeries.find({ practice: true, practiceStream: id }).select("questions"));
      const qIds = items.flatMap((i) => i.questions || []);
      const subjectIds = (await withDeleted(PracticeSubject.find({ stream: id }).select("_id"))).map((s) => s._id);
      await Promise.all([
        Question.deleteMany({ _id: { $in: qIds } }),
        TestSeries.deleteMany({ practice: true, practiceStream: id }),
        PracticeTopic.deleteMany({ subject: { $in: subjectIds } }),
        PracticeSubject.deleteMany({ stream: id }),
        PracticeStream.findByIdAndDelete(id),
      ]);
    },
  },
  practicesubject: {
    Model: PracticeSubject, label: "Practice subject",
    cascade: async (id) => {
      const items = await withDeleted(TestSeries.find({ practice: true, practiceSubject: id }).select("questions"));
      const qIds = items.flatMap((i) => i.questions || []);
      await Promise.all([
        Question.deleteMany({ _id: { $in: qIds } }),
        TestSeries.deleteMany({ practice: true, practiceSubject: id }),
        PracticeTopic.deleteMany({ subject: id }),
        PracticeSubject.findByIdAndDelete(id),
      ]);
    },
  },
  practicetopic: {
    Model: PracticeTopic, label: "Practice topic",
    cascade: async (id) => {
      const items = await withDeleted(TestSeries.find({ practice: true, practiceTopic: id }).select("questions"));
      const qIds = items.flatMap((i) => i.questions || []);
      await Promise.all([
        Question.deleteMany({ _id: { $in: qIds } }),
        TestSeries.deleteMany({ practice: true, practiceTopic: id }),
        PracticeTopic.findByIdAndDelete(id),
      ]);
    },
  },
};

// A short human title for each item type (different models title differently).
const titleOf = (type, doc) => {
  switch (type) {
    case "question": return String(doc.text || "").slice(0, 120) || "(question)";
    case "notice": return String(doc.text || "").slice(0, 120) || "(notice)";
    case "message": return doc.subject || doc.name || doc.email || "(message)";
    case "review": return doc.name || "(review)";
    case "coupon": return doc.code || "(coupon)";
    case "document": return doc.title || "(document)";
    case "feedback": return String(doc.message || "").slice(0, 120) || `${doc.context || ""} feedback`.trim() || "(feedback)";
    case "cbtregistration": return doc.name || doc.email || "(candidate)";
    case "aikey": return doc.label || "(API key)";
    default: return doc.title || doc.name || "(untitled)";
  }
};

// GET /api/recycle-bin  (admin) — every soft-deleted content item, newest first,
// grouped-friendly with type, id, title and when it was deleted.
export async function listRecycleBin(req, res) {
  const groups = await Promise.all(
    Object.entries(TYPES).map(async ([type, { Model, label }]) => {
      const docs = await Model.find(ONLY_DELETED)
        .sort("-deletedAt")
        .limit(1000)
        .select("title name text code subject email message context label deletedAt")
        .lean();
      return docs.map((d) => ({
        type,
        label,
        _id: d._id,
        title: titleOf(type, d),
        deletedAt: d.deletedAt || null,
      }));
    })
  );
  const items = groups.flat().sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
  // Per-type counts for the UI summary.
  const counts = items.reduce((acc, it) => { acc[it.type] = (acc[it.type] || 0) + 1; return acc; }, {});
  res.json({ items, counts, total: items.length });
}

// POST /api/recycle-bin/restore  { type, id }  (admin) — un-delete one item.
// Restoring a parent brings its whole subtree back (children were never flagged).
// A restored question is re-linked into its test's question list if it had one.
export async function restoreItem(req, res) {
  const { type, id } = req.body || {};
  const entry = TYPES[type];
  if (!entry) return res.status(400).json({ message: "Unknown item type." });
  const doc = await entry.Model.findByIdAndUpdate(id, restorePatch(), { new: true });
  if (!doc) return res.status(404).json({ message: `${entry.label} not found in the Recycle Bin.` });
  if (type === "question" && doc.testSeries) {
    await TestSeries.findByIdAndUpdate(doc.testSeries, { $addToSet: { questions: doc._id } });
  }
  res.json({ message: `${entry.label} restored.`, type, _id: doc._id });
}

// DELETE /api/recycle-bin/:type/:id  (admin) — permanently remove one item and
// cascade to its descendants. This is the real hard delete and cannot be undone.
export async function permanentDeleteItem(req, res) {
  const { type, id } = req.params;
  const entry = TYPES[type];
  if (!entry) return res.status(400).json({ message: "Unknown item type." });

  // Flat (childless) types just remove the single record for good.
  if (entry.flat) {
    await entry.Model.findByIdAndDelete(id);
    return res.json({ message: `${entry.label} permanently deleted.`, type, _id: id });
  }

  // Types with their own cascade routine (test series, exams, study & practice
  // trees) run it to hard-delete the record and everything beneath it.
  if (entry.cascade) {
    await entry.cascade(id);
    return res.json({ message: `${entry.label} permanently deleted.`, type, _id: id });
  }

  switch (type) {
    case "stream": {
      const subjectIds = (await Subject.find({ stream: id }).select("_id")).map((s) => s._id);
      await Promise.all([
        Question.deleteMany({ subject: { $in: subjectIds } }),
        Quiz.deleteMany({ subject: { $in: subjectIds } }),
        Session.deleteMany({ subject: { $in: subjectIds } }),
        Topic.deleteMany({ subject: { $in: subjectIds } }),
        Subject.deleteMany({ stream: id }),
        Stream.findByIdAndDelete(id),
      ]);
      break;
    }
    case "subject": {
      await Promise.all([
        Question.deleteMany({ subject: id }),
        Quiz.deleteMany({ subject: id }),
        Session.deleteMany({ subject: id }),
        Topic.deleteMany({ subject: id }),
        Subject.findByIdAndDelete(id),
      ]);
      break;
    }
    case "topic": {
      const sessionIds = (await Session.find({ topic: id }).select("_id")).map((s) => s._id);
      await Promise.all([
        Question.deleteMany({ session: { $in: sessionIds } }),
        Quiz.deleteMany({ session: { $in: sessionIds } }),
        Session.deleteMany({ topic: id }),
        Topic.findByIdAndDelete(id),
      ]);
      break;
    }
    case "session": {
      await Promise.all([
        Question.deleteMany({ session: id }),
        Quiz.deleteMany({ session: id }),
      ]);
      await Session.findByIdAndDelete(id);
      break;
    }
    case "quiz": {
      await Question.deleteMany({ quiz: id });
      await Quiz.findByIdAndDelete(id);
      break;
    }
    case "question": {
      const q = await Question.findById(id);
      if (q?.testSeries) await TestSeries.findByIdAndUpdate(q.testSeries, { $pull: { questions: q._id } });
      await Question.findByIdAndDelete(id);
      break;
    }
    default:
      return res.status(400).json({ message: "Unknown item type." });
  }
  res.json({ message: `${entry.label} permanently deleted.`, type, _id: id });
}

// DELETE /api/recycle-bin  (admin) — empty the whole content Recycle Bin.
// Permanently removes every soft-deleted content item and its descendants.
export async function emptyRecycleBin(req, res) {
  // Streams/subjects/topics/sessions/quizzes that are soft-deleted, plus their
  // descendants, and any soft-deleted questions.
  const [streamIds, subjectIds, topicIds, sessionIds, quizIds] = await Promise.all([
    Stream.find(ONLY_DELETED).select("_id").lean().then((r) => r.map((x) => x._id)),
    Subject.find(ONLY_DELETED).select("_id").lean().then((r) => r.map((x) => x._id)),
    Topic.find(ONLY_DELETED).select("_id").lean().then((r) => r.map((x) => x._id)),
    Session.find(ONLY_DELETED).select("_id").lean().then((r) => r.map((x) => x._id)),
    Quiz.find(ONLY_DELETED).select("_id").lean().then((r) => r.map((x) => x._id)),
  ]);

  // Expand cascade: subjects under deleted streams, topics under those, etc.
  const subUnderStream = (await Subject.find({ stream: { $in: streamIds } }).select("_id")).map((s) => s._id);
  const allSubjectIds = [...new Set([...subjectIds, ...subUnderStream].map(String))];
  const topicsUnder = (await Topic.find({ subject: { $in: allSubjectIds } }).select("_id")).map((t) => t._id);
  const allTopicIds = [...new Set([...topicIds, ...topicsUnder].map(String))];
  const sessionsUnder = (await Session.find({ $or: [{ subject: { $in: allSubjectIds } }, { topic: { $in: allTopicIds } }] }).select("_id")).map((s) => s._id);
  const allSessionIds = [...new Set([...sessionIds, ...sessionsUnder].map(String))];

  await Promise.all([
    Question.deleteMany({ $or: [
      { subject: { $in: allSubjectIds } },
      { session: { $in: allSessionIds } },
      { quiz: { $in: quizIds } },
      { deleted: true },
    ] }),
    Quiz.deleteMany({ $or: [{ subject: { $in: allSubjectIds } }, { session: { $in: allSessionIds } }, { _id: { $in: quizIds } }] }),
    Session.deleteMany({ _id: { $in: allSessionIds } }),
    Topic.deleteMany({ _id: { $in: allTopicIds } }),
    Subject.deleteMany({ _id: { $in: allSubjectIds } }),
    Stream.deleteMany({ _id: { $in: streamIds } }),
  ]);

  // Also purge every soft-deleted flat (childless) record.
  await Promise.all(
    Object.values(TYPES)
      .filter((t) => t.flat)
      .map((t) => t.Model.deleteMany(ONLY_DELETED))
  );

  // And run each cascade type's routine for every soft-deleted record it owns
  // (test series, exams, study & practice trees) so descendants go too.
  for (const [, entry] of Object.entries(TYPES)) {
    if (!entry.cascade) continue;
    const ids = (await withDeleted(entry.Model.find(ONLY_DELETED).select("_id")).lean()).map((d) => d._id);
    for (const id of ids) await entry.cascade(id);
  }
  res.json({ message: "Recycle Bin emptied." });
}

// Auto-purge: permanently delete Recycle Bin items older than the retention
// window. Controlled by RECYCLE_BIN_RETENTION_DAYS — default 0 means KEEP
// FOREVER (never auto-delete), so nothing disappears unless an admin opts in.
// Called on a throttled schedule from the health check (see app.js).
export async function purgeExpiredRecycleBin() {
  const days = Number(process.env.RECYCLE_BIN_RETENTION_DAYS || 0);
  if (!Number.isFinite(days) || days <= 0) return { purged: 0, skipped: true };
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const expired = { deleted: true, deletedAt: { $lt: cutoff } };
  let purged = 0;
  for (const [, entry] of Object.entries(TYPES)) {
    const ids = (await withDeleted(entry.Model.find(expired).select("_id")).lean()).map((d) => d._id);
    for (const id of ids) {
      if (entry.cascade) await entry.cascade(id);
      else await entry.Model.findByIdAndDelete(id);
      purged += 1;
    }
  }
  return { purged, skipped: false };
}
