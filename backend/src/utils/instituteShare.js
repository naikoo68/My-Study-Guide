// Super-admin "Share content to institutes" -- DUPLICATE a whole content node
// (a Stream, or an Exam for Public Test Series) and everything beneath it into
// one or more institute (tenant) accounts as their OWN independent copy. The
// copy appears automatically in the institute's account (no accept step) and is
// fully editable by them; later edits to YOUR original never touch their copy
// (it's a real copy, like emailing a file).
//
// Design notes:
//  - Copies are created with owner:null (platform content INSIDE the target
//    tenant) so they show up in that institute's normal admin lists, and are
//    stamped with the target tenant id explicitly.
//  - The whole operation runs UNSCOPED (so it can READ the source platform
//    content and WRITE into any target tenant), and every query/doc carries an
//    EXPLICIT tenantId so nothing leaks across tenants.
//  - Public Stream/Subject have GLOBAL-unique name+slug, so their copies get a
//    collision-safe "(shared)" name + unique slug. Practice models / Exam /
//    ExamPost have no unique constraint, so same-named containers within ONE
//    share are de-duplicated via an in-run cache.
//  - RESILIENT: each test/quiz copy is isolated in try/catch, so one bad record
//    never aborts the whole share (which would lose all progress AND hide the
//    reason). Failures are collected in result.errors and surfaced to the admin.

import PracticeStream from "../models/PracticeStream.js";
import PracticeExam from "../models/PracticeExam.js";
import PracticeSubject from "../models/PracticeSubject.js";
import PracticeTopic from "../models/PracticeTopic.js";
import Stream from "../models/Stream.js";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";
import Session from "../models/Session.js";
import Quiz from "../models/Quiz.js";
import Exam from "../models/Exam.js";
import ExamPost from "../models/ExamPost.js";
import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";
import Tenant from "../models/Tenant.js";
import { runUnscoped } from "./tenantContext.js";

export const SHARE_AREAS = ["my-quiz", "my-test", "public-quiz", "public-test"];

const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const newResult = () => ({ items: 0, questions: 0, errors: [] });
// Drop keys whose value is undefined so they never poison a find query / create.
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined));
// Keep the collected error list short so a bad batch can't bloat the job.
const noteError = (result, label, e) => {
  if (result.errors.length < 20) result.errors.push(`${label}: ${e?.message || e}`);
  console.error("[instituteShare]", label, "copy failed:", e?.stack || e);
};

// Question content fields copied verbatim into the new tenant (full fidelity,
// including diagram/graph/table specs that the generic duplicator omits).
const Q_FIELDS = [
  "text", "type", "options", "correct", "difficulty", "explanation",
  "optionExplanations", "columnA", "columnB", "tableRows", "assertion",
  "reason", "image", "topic", "section", "status", "graph", "viz",
];

// Resolve the institutes a share targets. `all` = every real institute (never
// the default/platform tenant, never deleted/suspended). Otherwise the given
// ids, filtered to valid, real, live institutes. Runs unscoped (cross-tenant).
export async function resolveTargetTenants({ all, tenantIds }) {
  return runUnscoped(async () => {
    if (all) {
      const ts = await Tenant.find({
        isDefault: { $ne: true },
        deleted: { $ne: true },
        status: { $ne: "suspended" },
      }).select("_id name").lean();
      return ts.map((t) => ({ id: t._id, name: t.name }));
    }
    const ids = (Array.isArray(tenantIds) ? tenantIds : [])
      .map((x) => String(x))
      .filter((x) => /^[a-f0-9]{24}$/i.test(x));
    if (!ids.length) return [];
    const ts = await Tenant.find({
      _id: { $in: ids },
      isDefault: { $ne: true },
      deleted: { $ne: true },
    }).select("_id name").lean();
    return ts.map((t) => ({ id: t._id, name: t.name }));
  });
}

// Copy every question matching `srcFilter` into the target tenant, re-pointing
// its parent refs via `assign`. Full-fidelity + preserves the original dates.
// MUST be called from an unscoped context (reads source globally; the explicit
// tenantId on each doc is what binds the copy to the target institute).
async function copyQuestions(srcFilter, assign, tenantId) {
  const qs = await Question.find(srcFilter).lean();
  if (!qs.length) return [];
  const docs = qs.map((q) => {
    const d = { ...assign, tenantId };
    for (const f of Q_FIELDS) if (q[f] !== undefined) d[f] = q[f];
    if (q.createdAt) d.createdAt = q.createdAt;
    if (q.updatedAt) d.updatedAt = q.updatedAt;
    return d;
  });
  try {
    return await Question.insertMany(docs, { ordered: false, timestamps: false });
  } catch (e) {
    return Array.isArray(e?.insertedDocs) ? e.insertedDocs : [];
  }
}

// Find-or-create (within THIS share run) a non-unique container in the target
// tenant, de-duped by an in-run cache so the same source node isn't recreated
// per child. Used for practice containers + public Topic/Session + Exam/Post.
//   - label     : the node's name string (mapped to `name` or `title`).
//   - match     : IDENTIFYING fields (parent refs) included in BOTH the lookup
//                 and the created doc, so a same-named node under a different
//                 parent stays distinct.
//   - create    : extra fields applied ONLY on create (cosmetic: icon/color...).
async function ensureContainer(Model, label, match, create, tenantId, cache, cacheKey) {
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const labelField = "name" in Model.schema.paths ? "name" : "title";
  const hasOwner = "owner" in Model.schema.paths;
  const m = clean(match);
  const query = { tenantId, [labelField]: label, ...m };
  if (hasOwner) query.owner = null;
  let node = await Model.findOne(query).lean();
  if (!node) {
    const doc = { [labelField]: label, tenantId, ...m, ...clean(create) };
    if (hasOwner) doc.owner = null;
    if ("slug" in Model.schema.paths) doc.slug = slugify(label);
    node = (await Model.create(doc)).toObject();
  }
  cache.set(cacheKey, node._id);
  return node._id;
}

// Create a GLOBAL-unique (name + slug) public Stream/Subject copy in the target
// tenant. On a clash it suffixes "(shared)" / "(shared N)" until both name and
// slug are free across ALL tenants (their unique indexes are global).
async function createUniquePublicNode(Model, baseName, extra, tenantId, cache, cacheKey) {
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const base = baseName || "Shared";
  let name = base;
  let slug = slugify(name) || "shared";
  for (let n = 1; n < 1000; n++) {
    const clash = (await Model.exists({ name })) || (await Model.exists({ slug }));
    if (!clash) break;
    name = n === 1 ? `${base} (shared)` : `${base} (shared ${n})`;
    slug = slugify(name) || `shared-${n}`;
  }
  const doc = { name, slug, tenantId, ...clean(extra) };
  const created = (await Model.create(doc)).toObject();
  cache.set(cacheKey, created._id);
  return created._id;
}

// --- Practice (My Quizzes / My Tests): PracticeStream -> [Exam] -> Subject ->
// [Topic] -> TestSeries(practice). Quiz kind uses the exam+topic levels; test/
// paper kind hangs the subject straight off the stream. ---
async function sharePracticeStream(streamId, tenantId, onItem) {
  const result = newResult();
  const items = await runUnscoped(() =>
    TestSeries.find({ practice: true, practiceStream: streamId })
      .populate("practiceStream", "name kind icon color")
      .populate("practiceExam", "name icon color")
      .populate("practiceSubject", "name icon color")
      .populate("practiceTopic", "name icon color")
      .lean()
  );
  if (!items.length) return result;

  await runUnscoped(async () => {
    const cache = new Map();
    for (const src of items) {
      try {
        const kind = src.practiceKind === "test" || src.practiceKind === "paper" ? src.practiceKind : "quiz";
        const isQuiz = kind === "quiz";

        const streamCopyId = await ensureContainer(
          PracticeStream,
          src.practiceStream?.name || "Shared",
          { kind: src.practiceStream?.kind || kind },
          { icon: src.practiceStream?.icon, color: src.practiceStream?.color },
          tenantId, cache, `pstream:${src.practiceStream?._id || src.practiceStream}`
        );

        let examCopyId;
        if (isQuiz && src.practiceExam) {
          examCopyId = await ensureContainer(
            PracticeExam,
            src.practiceExam?.name || "General",
            { stream: streamCopyId },
            { icon: src.practiceExam?.icon, color: src.practiceExam?.color },
            tenantId, cache, `pexam:${src.practiceExam?._id || src.practiceExam}`
          );
        }

        const subjectMatch = isQuiz
          ? { stream: streamCopyId, ...(examCopyId ? { exam: examCopyId } : {}) }
          : { stream: streamCopyId };
        const subjectCopyId = src.practiceSubject
          ? await ensureContainer(
              PracticeSubject,
              src.practiceSubject?.name || "Shared",
              subjectMatch,
              { icon: src.practiceSubject?.icon, color: src.practiceSubject?.color },
              tenantId, cache, `psub:${src.practiceSubject?._id || src.practiceSubject}`
            )
          : undefined;

        let topicCopyId;
        if (isQuiz && src.practiceTopic && subjectCopyId) {
          topicCopyId = await ensureContainer(
            PracticeTopic,
            src.practiceTopic?.name || "Shared",
            { subject: subjectCopyId },
            { icon: src.practiceTopic?.icon, color: src.practiceTopic?.color },
            tenantId, cache, `ptopic:${src.practiceTopic?._id || src.practiceTopic}`
          );
        }

        const copy = await TestSeries.create({
          name: src.name,
          owner: null,
          tenantId,
          practice: true,
          practiceKind: kind,
          practiceStream: streamCopyId,
          practiceExam: examCopyId,
          practiceSubject: subjectCopyId,
          practiceTopic: topicCopyId,
          category: src.category || "Full-Length",
          duration: src.duration,
          marks: src.marks,
          difficulty: src.difficulty,
          negativeMarking: src.negativeMarking,
          subjectPlan: Array.isArray(src.subjectPlan) ? src.subjectPlan : [],
          paperPdfUrl: src.paperPdfUrl || "",
          answerKeyPdfUrl: src.answerKeyPdfUrl || "",
          answerKeys: Array.isArray(src.answerKeys) ? src.answerKeys : [],
          additionalInfo: src.additionalInfo || "",
          status: "published",
          visibleToAll: false,
          ...(src.createdAt ? { createdAt: src.createdAt } : {}),
          ...(src.updatedAt ? { updatedAt: src.updatedAt } : {}),
        });
        const qs = await copyQuestions({ testSeries: src._id }, { testSeries: copy._id, owner: null }, tenantId);
        if (qs.length) await TestSeries.findByIdAndUpdate(copy._id, { $push: { questions: { $each: qs.map((c) => c._id) } } });
        result.items += 1;
        result.questions += qs.length;
        onItem?.();
      } catch (e) {
        noteError(result, `item "${src?.name || src?._id}"`, e);
      }
    }
  });
  return result;
}

// --- Public Quizzes: Stream -> Subject -> Topic -> Session -> Quiz -> Question. ---
async function sharePublicStream(streamId, tenantId, onItem) {
  const result = newResult();
  const [srcStream, subjects] = await runUnscoped(() =>
    Promise.all([
      Stream.findById(streamId).lean(),
      Subject.find({ $or: [{ stream: streamId }, { streams: streamId }] }).lean(),
    ])
  );
  if (!srcStream) return result;
  const subjectIds = subjects.map((s) => s._id);
  if (!subjectIds.length) return result;

  const quizzes = await runUnscoped(() =>
    Quiz.find({ subject: { $in: subjectIds } })
      .populate("subject", "name icon color image")
      .populate("session", "title index difficulty topic subject")
      .lean()
  );
  if (!quizzes.length) return result;

  // Preload the topics referenced by those sessions (for the Topic level).
  const topicIds = [...new Set(quizzes.map((q) => q.session?.topic).filter(Boolean).map(String))];
  const topics = topicIds.length
    ? await runUnscoped(() => Topic.find({ _id: { $in: topicIds } }).lean())
    : [];
  const topicById = new Map(topics.map((t) => [String(t._id), t]));

  await runUnscoped(async () => {
    const cache = new Map();
    // The stream copy is created lazily on the first successful quiz so a failure
    // creating it doesn't leave an empty orphan stream; cached after the first.
    const ensureStream = () => createUniquePublicNode(
      Stream, srcStream.name, { icon: srcStream.icon, color: srcStream.color, description: srcStream.description },
      tenantId, cache, `stream:${srcStream._id}`
    );

    for (const quiz of quizzes) {
      try {
        const srcSubject = quiz.subject;
        const srcSession = quiz.session;
        if (!srcSubject || !srcSession) continue;

        const streamCopyId = await ensureStream();

        const subjectCopyId = await createUniquePublicNode(
          Subject, srcSubject.name, { stream: streamCopyId, icon: srcSubject.icon, color: srcSubject.color, image: srcSubject.image || "" },
          tenantId, cache, `subject:${srcSubject._id}`
        );

        let topicCopyId;
        const srcTopic = srcSession.topic ? topicById.get(String(srcSession.topic)) : null;
        if (srcTopic) {
          topicCopyId = await ensureContainer(
            Topic, srcTopic.title, { subject: subjectCopyId }, { index: srcTopic.index || 1 },
            tenantId, cache, `topic:${srcTopic._id}`
          );
        }

        const sessionCopyId = await ensureContainer(
          Session, srcSession.title,
          { subject: subjectCopyId, topic: topicCopyId },
          { index: srcSession.index || 1, difficulty: srcSession.difficulty || "Medium" },
          tenantId, cache, `session:${srcSession._id}`
        );

        const quizCopy = await Quiz.create({
          subject: subjectCopyId,
          session: sessionCopyId,
          title: quiz.title,
          index: quiz.index || 1,
          difficulty: quiz.difficulty || "Medium",
          tenantId,
          ...(quiz.createdAt ? { createdAt: quiz.createdAt } : {}),
          ...(quiz.updatedAt ? { updatedAt: quiz.updatedAt } : {}),
        });
        const qs = await copyQuestions({ quiz: quiz._id }, { quiz: quizCopy._id, subject: subjectCopyId, session: sessionCopyId, owner: null }, tenantId);
        result.items += 1;
        result.questions += qs.length;
        onItem?.();
      } catch (e) {
        noteError(result, `quiz "${quiz?.title || quiz?._id}"`, e);
      }
    }
  });
  return result;
}

// --- Public Test Series: Exam -> ExamPost -> TestSeries(practice!=true) -> Q. ---
async function sharePublicExam(examId, tenantId, onItem) {
  const result = newResult();
  const [srcExam, posts, tests] = await runUnscoped(() =>
    Promise.all([
      Exam.findById(examId).lean(),
      ExamPost.find({ exam: examId }).lean(),
      TestSeries.find({ exam: examId, practice: { $ne: true } }).lean(),
    ])
  );
  if (!srcExam) return result;

  await runUnscoped(async () => {
    const cache = new Map();
    let examCopyId;
    const postCopyId = new Map();
    try {
      examCopyId = await ensureContainer(
        Exam, srcExam.name, {}, { description: srcExam.description || "", order: srcExam.order || 1 },
        tenantId, cache, `exam:${srcExam._id}`
      );
      for (const p of posts) {
        const id = await ensureContainer(
          ExamPost, p.name, { exam: examCopyId }, { description: p.description || "", order: p.order || 1 },
          tenantId, cache, `post:${p._id}`
        );
        postCopyId.set(String(p._id), id);
      }
    } catch (e) {
      noteError(result, `exam "${srcExam?.name}"`, e);
      return; // can't place tests without the exam container
    }

    for (const src of tests) {
      try {
        const copy = await TestSeries.create({
          name: src.name,
          owner: null,
          tenantId,
          exam: examCopyId,
          post: src.post ? postCopyId.get(String(src.post)) : undefined,
          category: src.category || "Full-Length",
          duration: src.duration,
          marks: src.marks,
          difficulty: src.difficulty,
          negativeMarking: src.negativeMarking,
          subjectPlan: Array.isArray(src.subjectPlan) ? src.subjectPlan : [],
          status: src.status || "draft",
          visibleToAll: src.visibleToAll === true,
          ...(src.createdAt ? { createdAt: src.createdAt } : {}),
          ...(src.updatedAt ? { updatedAt: src.updatedAt } : {}),
        });
        const qs = await copyQuestions({ testSeries: src._id }, { testSeries: copy._id, owner: null }, tenantId);
        if (qs.length) await TestSeries.findByIdAndUpdate(copy._id, { $push: { questions: { $each: qs.map((c) => c._id) } } });
        result.items += 1;
        result.questions += qs.length;
        onItem?.();
      } catch (e) {
        noteError(result, `test "${src?.name || src?._id}"`, e);
      }
    }
  });
  return result;
}

// Duplicate a content node (by area + id) into ONE target tenant. Returns
// { items, questions, errors }. `onItem` fires per copied test/quiz for progress.
export async function shareNodeToTenant({ area, id, tenantId }, onItem) {
  if (area === "my-quiz" || area === "my-test") return sharePracticeStream(id, tenantId, onItem);
  if (area === "public-quiz") return sharePublicStream(id, tenantId, onItem);
  if (area === "public-test") return sharePublicExam(id, tenantId, onItem);
  throw new Error("Unknown share area");
}
