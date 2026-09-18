// The "answer flashcard" shown once a student reveals the answer in a quiz.
// Mirrors the study-card design: the CORRECT answer, a focused Explanation
// (with an optional figure), Key Points (crisp takeaways) and a Quick Recall
// memory hook. Key Points / Quick Recall render only when the question actually
// has that data (AI-generated / backfilled), so questions without them simply
// show the Correct Answer + Explanation — no empty or duplicated sections.
import { CheckCircle2, BookOpen, Lightbulb, GraduationCap } from "lucide-react";
import MathText from "./MathText";
import { displayOptions } from "../../lib/questions";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function FlashcardAnswer({ q, explanationOnly = false }) {
  if (!q) return null;
  const opts = displayOptions(q) || [];
  const correctIdx = typeof q.correct === "number" ? q.correct : -1;
  const correctText = correctIdx >= 0 ? opts[correctIdx] : "";
  const explanation = String(q.explanation || "").trim();
  const keyPoints = (Array.isArray(q.keyPoints) ? q.keyPoints : [])
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  const quickRecall = String(q.quickRecall || "").trim();

  return (
    <div className="mt-4 animate-fade-in space-y-3">
      {/* Correct answer */}
      {!explanationOnly && correctIdx >= 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-900/20">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                Correct Answer: {LETTERS[correctIdx] || correctIdx + 1}
              </p>
              {correctText && (
                <div className="mt-0.5 text-sm text-emerald-900/90 dark:text-emerald-100/90">
                  <MathText>{correctText}</MathText>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Explanation (+ optional figure) */}
      {explanation && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/50 dark:bg-sky-900/20">
          <div className="flex items-center gap-2 font-semibold text-sky-700 dark:text-sky-300">
            <BookOpen className="h-5 w-5" /> Explanation
          </div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
              <MathText>{explanation}</MathText>
            </div>
            {q.image && (
              <img src={q.image} alt="" className="max-h-40 w-full rounded-lg object-contain sm:w-40 sm:flex-shrink-0" />
            )}
          </div>
        </div>
      )}

      {/* Key points (only when the question has them) */}
      {!explanationOnly && keyPoints.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
            <Lightbulb className="h-5 w-5" /> Key Points
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900/90 dark:text-amber-100/90">
            {keyPoints.map((p, i) => (
              <li key={i}><MathText>{p}</MathText></li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick recall memory hook (only when present) */}
      {!explanationOnly && quickRecall && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-900/20">
          <div className="flex items-center gap-2 font-semibold text-indigo-700 dark:text-indigo-300">
            <GraduationCap className="h-5 w-5" /> Quick Recall
          </div>
          <div className="mt-1 text-sm font-medium text-indigo-900/90 dark:text-indigo-100/90">
            <MathText>{quickRecall}</MathText>
          </div>
        </div>
      )}
    </div>
  );
}
