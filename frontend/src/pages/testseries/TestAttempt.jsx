import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Flag,
  Save,
  CheckCircle2,
  AlertTriangle,
  X,
  Trophy,
} from "lucide-react";
import { testSeries } from "../../data/tests";
import { getQuestions } from "../../data/questions";

// Status keys for the palette legend.
const STATUS = {
  NOT_VISITED: "not_visited",
  NOT_ANSWERED: "not_answered",
  ANSWERED: "answered",
  MARKED: "marked",
  ANSWERED_MARKED: "answered_marked",
};

export default function TestAttempt() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const test = testSeries.find((t) => t.id === testId) || testSeries[0];

  // Build a question set sized to the test.
  const questions = useMemo(() => {
    const base = getQuestions("test-generic");
    const count = Math.min(test.questions, 30); // cap for demo performance
    return Array.from({ length: count }).map((_, i) => ({
      ...base[i % base.length],
      id: `t-${i}`,
    }));
  }, [test]);

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState({});
  const [visited, setVisited] = useState({ 0: true });
  const [remaining, setRemaining] = useState(test.duration * 60);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const containerRef = useRef(null);

  const finalize = useCallback(() => {
    setSubmitted(true);
    setConfirmOpen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // Countdown with auto-submit at 0.
  useEffect(() => {
    if (submitted) return;
    if (remaining <= 0) {
      finalize();
      return;
    }
    const t = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(t);
  }, [remaining, submitted, finalize]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const markVisited = (i) => setVisited((v) => ({ ...v, [i]: true }));
  const goTo = (i) => {
    setCurrent(i);
    markVisited(i);
  };

  const select = (idx) => setAnswers((a) => ({ ...a, [current]: idx }));

  const saveNext = () => {
    if (current < questions.length - 1) goTo(current + 1);
  };
  const markReviewNext = () => {
    setMarked((m) => ({ ...m, [current]: true }));
    if (current < questions.length - 1) goTo(current + 1);
  };
  const clearResponse = () =>
    setAnswers((a) => {
      const copy = { ...a };
      delete copy[current];
      return copy;
    });

  const statusOf = (i) => {
    const ans = answers[i] !== undefined;
    const mk = marked[i];
    if (ans && mk) return STATUS.ANSWERED_MARKED;
    if (mk) return STATUS.MARKED;
    if (ans) return STATUS.ANSWERED;
    if (visited[i]) return STATUS.NOT_ANSWERED;
    return STATUS.NOT_VISITED;
  };

  const paletteColor = (s) =>
    ({
      [STATUS.ANSWERED]: "bg-emerald-500 text-white",
      [STATUS.NOT_ANSWERED]: "bg-rose-500 text-white",
      [STATUS.MARKED]: "bg-violet-500 text-white",
      [STATUS.ANSWERED_MARKED]: "bg-violet-500 text-white ring-2 ring-emerald-400",
      [STATUS.NOT_VISITED]: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    }[s]);

  const counts = useMemo(() => {
    const c = { answered: 0, notAnswered: 0, marked: 0, notVisited: 0 };
    questions.forEach((_, i) => {
      const s = statusOf(i);
      if (s === STATUS.ANSWERED || s === STATUS.ANSWERED_MARKED) c.answered++;
      else if (s === STATUS.MARKED) c.marked++;
      else if (s === STATUS.NOT_ANSWERED) c.notAnswered++;
      else c.notVisited++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, marked, visited, questions]);

  const hh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const lowTime = remaining < 300;

  // ---- Result screen ----
  if (submitted) {
    let correct = 0;
    questions.forEach((q, i) => answers[i] === q.correct && correct++);
    const attempted = Object.keys(answers).length;
    const score = correct * (test.marks / questions.length);
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="card w-full max-w-lg p-8 text-center">
          <Trophy className="mx-auto h-14 w-14 text-accent-500" />
          <h1 className="mt-4 text-2xl font-extrabold">Test Submitted</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{test.name}</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {[
              { l: "Score", v: `${Math.round(score)}/${test.marks}` },
              { l: "Correct", v: correct },
              { l: "Attempted", v: `${attempted}/${questions.length}` },
              { l: "Accuracy", v: `${attempted ? Math.round((correct / attempted) * 100) : 0}%` },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
                <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{s.v}</p>
                <p className="text-sm text-slate-500">{s.l}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={() => navigate("/dashboard")} className="btn-primary flex-1">
              Go to Dashboard
            </button>
            <button onClick={() => navigate("/test-series")} className="btn-outline flex-1">
              More Tests
            </button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <h1 className="truncate text-sm font-bold sm:text-base">{test.name}</h1>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono font-bold ${
                lowTime ? "animate-pulse bg-rose-500 text-white" : "bg-brand-600 text-white"
              }`}
            >
              <Clock className="h-4 w-4" /> {hh}:{mm}:{ss}
            </span>
            <button onClick={toggleFullscreen} className="btn-outline px-3">
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
            <button onClick={() => setConfirmOpen(true)} className="btn-accent">
              Submit
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr,320px]">
        {/* Question area */}
        <div className="card flex flex-col p-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <span className="font-bold">Question {current + 1}</span>
            <span className="text-sm text-slate-500">
              +{(test.marks / questions.length).toFixed(0)} / -0.25
            </span>
          </div>

          <h2 className="mt-5 text-lg font-semibold leading-relaxed">{q.text}</h2>

          <div className="mt-5 space-y-3">
            {q.options.map((opt, idx) => (
              <label
                key={idx}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition ${
                  answers[current] === idx
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                    : "border-slate-200 hover:border-brand-300 dark:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${current}`}
                  checked={answers[current] === idx}
                  onChange={() => select(idx)}
                  className="h-4 w-4 text-brand-600"
                />
                {opt}
              </label>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex gap-2">
              <button
                onClick={() => goTo(Math.max(0, current - 1))}
                disabled={current === 0}
                className="btn-outline"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button onClick={clearResponse} className="btn-ghost">
                Clear
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={markReviewNext} className="btn-outline">
                <Flag className="h-4 w-4" /> Mark & Next
              </button>
              <button onClick={saveNext} className="btn-primary">
                <Save className="h-4 w-4" /> Save & Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar palette */}
        <aside className="card flex flex-col p-5">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500" /> Answered ({counts.answered})</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500" /> Not Answered ({counts.notAnswered})</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-500" /> Marked ({counts.marked})</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-300 dark:bg-slate-700" /> Not Visited ({counts.notVisited})</span>
          </div>

          <div className="mt-4 grid max-h-[50vh] grid-cols-6 gap-2 overflow-y-auto pr-1">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold transition ${paletteColor(
                  statusOf(i)
                )} ${i === current ? "ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900" : ""}`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button onClick={() => setConfirmOpen(true)} className="btn-accent mt-5 w-full">
            <Flag className="h-4 w-4" /> Submit Test
          </button>
        </aside>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-md animate-scale-in p-6">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Submit Test?
              </h3>
              <button onClick={() => setConfirmOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/20">
                <p className="font-bold text-emerald-600">{counts.answered}</p> Answered
              </div>
              <div className="rounded-lg bg-rose-50 p-3 dark:bg-rose-900/20">
                <p className="font-bold text-rose-600">{counts.notAnswered + counts.notVisited}</p> Unanswered
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              You won't be able to change answers after submitting.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmOpen(false)} className="btn-outline flex-1">
                Resume
              </button>
              <button onClick={finalize} className="btn-accent flex-1">
                <CheckCircle2 className="h-4 w-4" /> Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
