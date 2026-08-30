import PracticeStream from "../models/PracticeStream.js";
import PracticeExam from "../models/PracticeExam.js";
import PracticeSubject from "../models/PracticeSubject.js";
import TestSeries from "../models/TestSeries.js";

const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// One-time backfill for the new My-Quiz "Exam" level.
//
// The My-Quiz hierarchy became Stream → Exam → Subject → Topic → Quiz. Existing
// content has subjects hanging directly off the stream (subject.exam == null)
// and quiz items with no practiceExam. For every quiz-kind stream we ensure a
// default "General" exam (scoped to that stream + owner) and move its exam-less
// subjects — and their quiz items — under it, so nothing is orphaned from the
// exam-based browse/admin views.
//
// Idempotent: streams whose subjects already have an exam are skipped, and it
// only ever creates ONE "General" exam per stream+owner. Safe to re-run.
export async function backfillPracticeExams({ log = () => {} } = {}) {
  const streams = await PracticeStream.find({ kind: "quiz" }).lean();
  let examsCreated = 0;
  let subjectsMoved = 0;
  let itemsUpdated = 0;

  for (const stream of streams) {
    const owner = stream.owner ?? null;
    const subjects = await PracticeSubject.find({ stream: stream._id }).lean();
    const orphanSubjects = subjects.filter((s) => !s.exam);

    // Ensure a "General" exam exists whenever this stream has any content that
    // still needs a home (exam-less subjects, or quiz items missing an exam).
    let items = await TestSeries.find({ practice: true, practiceKind: "quiz", practiceStream: stream._id }).lean();
    const orphanItems = items.filter((it) => !it.practiceExam);
    if (!orphanSubjects.length && !orphanItems.length) continue;

    let exam = await PracticeExam.findOne({ stream: stream._id, name: "General", owner }).lean();
    if (!exam) {
      // Stamp the exam with the SAME tenant as its parent stream. At boot there
      // is no request context, so without this the exam would be saved with a
      // null tenantId and a tenant-scoped creator couldn't edit/delete it.
      exam = (await PracticeExam.create({ stream: stream._id, name: "General", slug: "general", owner, tenantId: stream.tenantId ?? null })).toObject();
      examsCreated += 1;
    } else if (String(exam.tenantId || "") !== String(stream.tenantId || "")) {
      // Repair an exam a previous run created without the stream's tenant.
      await PracticeExam.updateOne({ _id: exam._id }, { $set: { tenantId: stream.tenantId ?? null } });
    }

    for (const s of orphanSubjects) {
      await PracticeSubject.updateOne({ _id: s._id }, { $set: { exam: exam._id } });
      subjectsMoved += 1;
    }

    // Point each exam-less quiz item at its subject's exam (the pre-existing one
    // if the subject already had it, else the "General" exam we just assigned).
    const subjExam = new Map(subjects.map((s) => [String(s._id), s.exam ? String(s.exam) : String(exam._id)]));
    for (const it of orphanItems) {
      const examId = subjExam.get(String(it.practiceSubject)) || String(exam._id);
      await TestSeries.updateOne({ _id: it._id }, { $set: { practiceExam: examId } });
      itemsUpdated += 1;
    }
  }

  log(`Practice-exam backfill: ${examsCreated} exam(s) created, ${subjectsMoved} subject(s) moved, ${itemsUpdated} item(s) updated.`);
  return { examsCreated, subjectsMoved, itemsUpdated };
}

// Align every PracticeExam's `tenantId` with its parent stream's tenant.
//
// The one-time backfill (and any exam created outside a request context) can
// save a "General" exam with a null tenantId. Under multi-tenant enforcement a
// scoped creator can then SEE that exam (reads include null-tenant content) but
// NOT edit/delete it (writes require an exact tenant match) — e.g. renaming
// "General" fails. This repair copies the stream's tenant onto its exams so the
// owning creator can manage them. Idempotent; MUST run unscoped (at boot) so it
// can match null-tenant rows.
export async function repairPracticeExamTenants({ log = () => {} } = {}) {
  const [exams, streams] = await Promise.all([
    PracticeExam.find({}).select("_id stream tenantId").lean(),
    PracticeStream.find({}).select("_id tenantId").lean(),
  ]);
  const streamTenant = new Map(streams.map((s) => [String(s._id), s.tenantId ?? null]));
  let fixed = 0;
  for (const e of exams) {
    if (!e.stream || !streamTenant.has(String(e.stream))) continue;
    const want = streamTenant.get(String(e.stream));
    if (String(e.tenantId || "") !== String(want || "")) {
      await PracticeExam.updateOne({ _id: e._id }, { $set: { tenantId: want } });
      fixed += 1;
    }
  }
  if (fixed) log(`Repaired tenantId on ${fixed} practice exam(s) to match their stream.`);
  return { fixed };
}
