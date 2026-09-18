// Student-facing FLASHCARD viewer. Opened from the "Flashcard" button that
// appears once a question's answer/explanation is revealed. Shows the full
// two-sided flashcard for ONE question:
//   • Front  → the question (real quiz renderer: every type supported)
//   • Back   → the full answer (Correct Answer + Explanation + Key Points +
//              Quick Recall), via the shared FlashcardAnswer component.
// Tap "Show Answer" / "Show Question" to flip. Responsive + theme-aware, so it
// reads well on mobile and in dark mode.
import { useState } from "react";
import { X, Eye, RotateCcw, GraduationCap, BookOpenCheck, CheckCircle2 } from "lucide-react";
import { FrontContent } from "../../pages/FlashcardCardImage";
import FlashcardAnswer from "./FlashcardAnswer";

export default function FlashcardModal({ q, onClose }) {
  const [showBack, setShowBack] = useState(false);
  if (!q) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-6 w-full max-w-2xl animate-scale-in rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:p-6"
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
            showBack ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                     : "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"}`}>
            {showBack ? <CheckCircle2 className="h-4 w-4" /> : <BookOpenCheck className="h-4 w-4" />}
            {showBack ? "Answer" : "Flashcard"}
          </span>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Card body */}
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700 sm:p-5">
          {showBack ? <FlashcardAnswer q={q} /> : <FrontContent q={q} />}
        </div>

        {/* Flip control */}
        <div className="mt-4 flex justify-center">
          <button onClick={() => setShowBack((v) => !v)} className={showBack ? "btn-outline" : "btn-primary"}>
            {showBack ? <><RotateCcw className="h-4 w-4" /> Show Question</> : <><Eye className="h-4 w-4" /> Show Answer</>}
          </button>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <GraduationCap className="h-3.5 w-3.5" /> Study this question as a flashcard
        </p>
      </div>
    </div>
  );
}
