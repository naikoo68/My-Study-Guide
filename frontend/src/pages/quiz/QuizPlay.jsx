import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  BookmarkCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Flag,
  Grid3x3,
  X,
} from "lucide-react";
import { getQuestions } from "../../data/questions";
import { getSubject } from "../../data/subjects";
import ProgressBar from "../../components/ui/ProgressBar";
import Badge from "../../components/ui/Badge";

const optionLabels = ["A", "B", "C", "D"];

export default function QuizPlay() {
  const { subjectId, sessionId } = useParams();
  const navigate = useNavigate();
  const questions = useMemo(() => getQuestions(sessionId), [sessionId]);
  const subject = getSubject(subjectId);
  const storageKey = `mpm-quiz-${sessionId}`;

  const [current, setCurrent] = useState(0);
  // answers[i] = selected option index (locked once chosen)
  const [answers, setAnswers] = useState({});
  const [bookmarks, setBookmarks] = useState({});
  const [seconds, setSeconds] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Restore auto-saved progress
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setAnswers(data.answers || {});
        setBookmarks(data.bookmarks || {});
        setSeconds(data.seconds || 0);
        setCurrent(data.current || 0);
      } catch {
        /* ignore corrupt save */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-save on every change
  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ answers, bookmarks, seconds, current })
    );
  }, [answers, bookmarks, seconds, current, storageKey]);

  const q = questions[current];
  const answered = answers[current] !== undefined;

  const selectOption = (idx) => {
    if (answered) return; // lock after first selection
    setAnswers((a) => ({ ...a, [current]: idx }));
  };

  const toggleBookmark = () =>
    setBookmarks((b) => ({ ...b, [current]: !b[current] }));

  const goTo = (i) => {
    setCurrent(i);
    setPaletteOpen(false);
  };

  const next = () => current < questions.length - 1 && setCurrent((c) => c + 1);
  const prev = () => current > 0 && setCurrent((c) => c - 1);

  const submit = useCallback(() => {
    let correct = 0;
    questions.forEach((qq, i) => {
      if (answers[i] === qq.correct) correct += 1;
    });
    const attempted = Object.keys(answers).length;
    const result = {
      subjectId,
      sessionId,
      subjectName: subject?.name || "Quiz",
      total: questions.length,
      attempted,
      correct,
      incorrect: attempted - correct,
      score: correct * 4 - (attempted - correct), // +4 / -1 scheme
      maxScore: questions.length * 4,
      percentage: Math.round((correct / questions.length) * 100),
      timeTaken: seconds,
      weakTopics: [
        ...new Set(
          questions
            .filter((qq, i) => answers[i] !== undefined && answers[i] !== qq.correct)
            .map((qq) => qq.topic)
        ),
      ],
      review: questions.map((qq, i) => ({
        text: qq.text,
        options: qq.options,
        correct: qq.correct,
        chosen: answers[i] ?? null,
        topic: qq.topic,
        explanation: qq.explanation,
      })),
    };
    localStorage.removeItem(storageKey);
    navigate(`/quiz/${subjectId}/${sessionId}/result`, { state: result });
  }, [answers, questions, seconds, subjectId, sessionId, subject, navigate, storageKey]);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;

  // Determine option styling after answering
  const optionClass = (idx) => {
    const base =
      "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all duration-200";
    if (!answered) {
      return `${base} border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-600 dark:hover:bg-slate-800`;
    }
    if (idx === q.correct) {
      return `${base} border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200`;
    }
    if (idx === answers[current]) {
      return `${base} border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200`;
    }
    return `${base} border-slate-200 bg-white opacity-60 dark:border-slate-700 dark:bg-slate-900`;
  };

  const Palette = () => (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
      {questions.map((_, i) => {
        const isAnswered = answers[i] !== undefined;
        const isCorrect = isAnswered && answers[i] === questions[i].correct;
        const isBookmarked = bookmarks[i];
        let cls =
          "relative flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold transition";
        if (i === current) cls += " ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900";
        if (isAnswered)
          cls += isCorrect
            ? " bg-emerald-500 text-white"
            : " bg-rose-500 text-white";
        else cls += " bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
        return (
          <button key={i} onClick={() => goTo(i)} className={cls}>
            {i + 1}
            {isBookmarked && (
              <Flag className="absolute -right-1 -top-1 h-3 w-3 fill-accent-500 text-accent-500" />
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="container-page py-6">
      {/* Top bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate(`/quiz/${subjectId}`)} className="btn-ghost -ml-2">
          <ChevronLeft className="h-4 w-4" /> Exit
        </button>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white">
            <Clock className="h-4 w-4" /> {mmss}
          </span>
          <button
            onClick={() => setPaletteOpen(true)}
            className="btn-outline lg:hidden"
          >
            <Grid3x3 className="h-4 w-4" /> Palette
          </button>
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="font-medium">
            Question {current + 1} of {questions.length}
          </span>
          <span className="text-slate-500">
            {Object.keys(answers).length} answered
          </span>
        </div>
        <ProgressBar value={((current + 1) / questions.length) * 100} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
        {/* Question card */}
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <Badge variant={q.difficulty}>{q.difficulty}</Badge>
            <button
              onClick={toggleBookmark}
              className={`flex items-center gap-1.5 text-sm font-medium transition ${
                bookmarks[current]
                  ? "text-accent-600 dark:text-accent-400"
                  : "text-slate-400 hover:text-accent-500"
              }`}
            >
              {bookmarks[current] ? (
                <BookmarkCheck className="h-5 w-5" />
              ) : (
                <Bookmark className="h-5 w-5" />
              )}
              {bookmarks[current] ? "Bookmarked" : "Bookmark"}
            </button>
          </div>

          <h2 className="text-lg font-semibold leading-relaxed">{q.text}</h2>

          <div className="mt-5 space-y-3">
            {q.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => selectOption(idx)}
                disabled={answered}
                className={optionClass(idx)}
              >
                <span
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
                    answered && idx === q.correct
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : answered && idx === answers[current]
                      ? "border-rose-500 bg-rose-500 text-white"
                      : "border-slate-300 dark:border-slate-600"
                  }`}
                >
                  {optionLabels[idx]}
                </span>
                <span className="flex-1">{opt}</span>
                {answered && idx === q.correct && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                )}
                {answered && idx === answers[current] && idx !== q.correct && (
                  <XCircle className="h-5 w-5 text-rose-500" />
                )}
              </button>
            ))}
          </div>

          {/* Explanation */}
          {answered && (
            <div className="mt-5 animate-fade-in rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                <Lightbulb className="h-5 w-5" /> Explanation
              </div>
              <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-100/90">
                {q.explanation}
              </p>
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-6 flex items-center justify-between">
            <button onClick={prev} disabled={current === 0} className="btn-outline">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            {current === questions.length - 1 ? (
              <button onClick={submit} className="btn-accent">
                <Flag className="h-4 w-4" /> Submit Quiz
              </button>
            ) : (
              <button onClick={next} className="btn-primary">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Palette - desktop */}
        <aside className="hidden lg:block">
          <div className="card sticky top-20 p-5">
            <h3 className="mb-3 font-bold">Question Palette</h3>
            <Palette />
            <div className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-emerald-500" /> Correct</p>
              <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-rose-500" /> Incorrect</p>
              <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-300 dark:bg-slate-700" /> Not attempted</p>
              <p className="flex items-center gap-2"><Flag className="h-3 w-3 fill-accent-500 text-accent-500" /> Bookmarked</p>
            </div>
            <button onClick={submit} className="btn-accent mt-5 w-full">
              <Flag className="h-4 w-4" /> Submit Quiz
            </button>
          </div>
        </aside>
      </div>

      {/* Palette - mobile drawer */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPaletteOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 animate-fade-in-up rounded-t-3xl bg-white p-6 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold">Question Palette</h3>
              <button onClick={() => setPaletteOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Palette />
            <button onClick={submit} className="btn-accent mt-5 w-full">
              <Flag className="h-4 w-4" /> Submit Quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
