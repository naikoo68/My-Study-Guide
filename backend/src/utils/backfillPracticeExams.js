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
      exam = (await PracticeExam.create({ stream: stream._id, name: "General", slug: "general", owner })).toObject();
      examsCreated += 1;
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
