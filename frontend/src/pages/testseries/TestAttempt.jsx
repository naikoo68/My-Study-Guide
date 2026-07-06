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
  XCircle,
  AlertTriangle,
  X,
  Trophy,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { testService } from "../../services";
import { Loading, ErrorState } from "../../components/ui/AsyncState";
import MathText from "../../components/ui/MathText";
import StatementPairView from "../../components/ui/StatementPairView";
import FeedbackButton from "../../components/ui/FeedbackButton";
import { useZoom } from "../../context/ZoomContext";

// Roman numerals for Column B labels (I, II, III, IV…)
function toRoman(n) {
  const m = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
  let r = "";
  for (const [s, v] of m) while (n >= v) { r += s; n -= v; }
  return r;
}

// Option index → letter (A, B, C…), or — when none.
const optLetter = (n) => (n == null ? "—" : String.fromCharCode(65 + n));

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

  const [test, setTest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState({});
  const [visited, setVisited] = useState({ 0: true });
  const [remaining, setRemaining] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const { zoom, zoomIn, zoomOut } = useZoom();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef(null);

  // Load the test + its questions (answers hidden by the API).
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    testService
      .get(testId)
      .then((t) => {
        setTest(t);
        setQuestions(t.questions || []);
        setRemaining((t.duration || 30) * 60);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [testId]);

  useEffect(load, [load]);

  const finalize = useCallback(async () => {
    if (submitting || result) return;
    setSubmitting(true);
    setConfirmOpen(false);
    const byId = {};
    questions.forEach((q, i) => {
      if (answers[i] !== undefined) byId[q._id] = answers[i];
    });
    const elapsed = (test?.duration || 0) * 60 - remaining;
    try {
      const res = await testService.submit(testId, byId, elapsed);
      setResult(res);
    } catch (e) {
      setError(e.message || "Could not submit the test.");
    } finally {
      setSubmitting(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, [answers, questions, test, remaining, testId, submitting, result]);

  // Countdown with auto-submit at 0.
  useEffect(() => {
    if (loading || result || !test) return;
    if (remaining <= 0) {
      finalize();
      return;
    }
    const t = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(t);
  }, [remaining, loading, result, test, finalize]);

  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!fullscreen) {
      setFullscreen(true);
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      setFullscreen(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  };

  const goTo = (i) => {
    setCurrent(i);
    setVisited((v) => ({ ...v, [i]: true }));
  };
  const select = (idx) => setAnswers((a) => ({ ...a, [current]: idx }));
  const saveNext = () => current < questions.length - 1 && goTo(current + 1);
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

  if (loading) return <div className="container-page"><Loading label="Loading test..." /></div>;
  if (error && !result) return <div className="container-page"><ErrorState message={error} onRetry={load} /></div>;

  const hh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const lowTime = remaining < 300;
  // Full context for feedback: "Exam › Post › Test (Test)"
  const testSource = test
    ? [test.exam?.name, test.post?.name, test.name].filter(Boolean).join(" › ") + " (Test)"
    : "Test";

  // ---- Result screen (uses backend-graded data) ----
  if (result) {
    const review = result.review || [];
    const stats = [
      { l: "Score", v: `${result.score}/${result.maxScore ?? test.marks}`, c: "text-brand-600 dark:text-brand-400" },
      { l: "Percentage", v: `${result.percentage}%`, c: "text-brand-600 dark:text-brand-400" },
      { l: "Total", v: result.total, c: "text-slate-700 dark:text-slate-200" },
      { l: "Attempted", v: result.attempted, c: "text-slate-700 dark:text-slate-200" },
      { l: "Correct", v: result.correct, c: "text-emerald-600 dark:text-emerald-400" },
      { l: "Wrong", v: result.incorrect, c: "text-rose-600 dark:text-rose-400" },
      { l: "Skipped", v: result.skipped, c: "text-amber-600 dark:text-amber-400" },
    ];
    return (
      <div className="min-h-screen bg-slate-50 py-10 dark:bg-slate-950">
        <div className="container-page">
          <div className="card p-8 text-center">
            <Trophy className="mx-auto h-14 w-14 text-accent-500" />
            <h1 className="mt-4 text-2xl font-extrabold">Test Submitted</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">{test.name}</p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {stats.map((s) => (
                <div key={s.l} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <p className={`text-2xl font-bold ${s.c}`}>{s.v}</p>
                  <p className="text-xs text-slate-500">{s.l}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {review.length > 0 && (
                <button onClick={() => setShowReview((v) => !v)} className="btn-accent">
                  {showReview ? "Hide" : "Review"} Answers
                </button>
              )}
              <FeedbackButton context="test" source={testSource} label="Give Feedback" className="btn-outline" />
              <button onClick={() => navigate("/dashboard")} className="btn-primary">Go to Dashboard</button>
              <button onClick={() => navigate("/test-series")} className="btn-outline">More Tests</button>
            </div>
          </div>

          {/* Answer review */}
          {showReview && (
            <div className="mt-6 space-y-4">
              {review.map((r, i) => (
                <div key={r._id || i} className="card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">
                      <span className="mr-2 text-slate-400">Q{i + 1}.</span>
                      <MathText>{r.text}</MathText>
                    </p>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className={`text-xs font-semibold ${
                        r.chosen === null ? "text-amber-600" : r.isCorrect ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {r.chosen === null ? "Skipped" : r.isCorrect ? "Correct" : "Wrong"}
                      </span>
                      <FeedbackButton
                        context="question"
                        label="Feedback"
                        questionNumber={i + 1}
                        questionText={r.text}
                        source={testSource}
                        details={`Correct: ${optLetter(r.correct)}${r.chosen != null ? `, Chosen: ${optLetter(r.chosen)}` : ", Skipped"}`}
                        question={r}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400"
                      />
                    </div>
                  </div>
                  {r.image && <img src={r.image} alt="" className="mt-3 max-h-52 rounded-lg object-contain" />}

                  {r.type === "matching" && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                        <p className="mb-1 text-xs font-semibold uppercase text-brand-600 dark:text-brand-400">Column A</p>
                        {(r.columnA || []).map((item, k) => (
                          <div key={k} className="flex items-start gap-1.5 text-sm"><span className="font-bold text-brand-700 dark:text-brand-300">{k + 1}.</span> <MathText>{item}</MathText></div>
                        ))}
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                        <p className="mb-1 text-xs font-semibold uppercase text-accent-600 dark:text-accent-400">Column B</p>
                        {(r.columnB || []).map((item, k) => (
                          <div key={k} className="flex items-start gap-1.5 text-sm"><span className="font-bold text-accent-700 dark:text-accent-300">{toRoman(k + 1)}.</span> <MathText>{item}</MathText></div>
                        ))}
                      </div>
                    </div>
                  )}

                  <StatementPairView q={r} />

                  <div className="mt-3 space-y-2">
                    {(r.options || []).map((opt, idx) => {
                      const isCorrect = idx === r.correct;
                      const isChosen = idx === r.chosen;
                      const optExp = r.optionExplanations?.[idx];
                      let cls = "flex items-center gap-2 rounded-lg px-3 py-2 text-sm ";
                      if (isCorrect) cls += "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
                      else if (isChosen) cls += "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
                      else cls += "text-slate-500 dark:text-slate-400";
                      return (
                        <div key={idx}>
                          <div className={cls}>
                            {isCorrect ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : isChosen ? <XCircle className="h-4 w-4 flex-shrink-0" /> : <span className="h-4 w-4" />}
                            {r.type === "matching" && <span className="font-bold">({String.fromCharCode(97 + idx)})</span>}
                            <MathText>{opt}</MathText>
                          </div>
                          {isChosen && !isCorrect && optExp && optExp.trim() && (
                            <p className="ml-6 mt-0.5 text-xs text-rose-500 dark:text-rose-400"><MathText>{optExp}</MathText></p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {r.explanation && (
                    <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm dark:bg-brand-900/20">
                      <span className="font-semibold text-brand-700 dark:text-brand-300">Explanation: </span>
                      <MathText>{r.explanation}</MathText>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const q = questions[current];
  if (!q) {
    return (
      <div className="container-page">
        <ErrorState message="This test has no questions yet." onRetry={() => navigate("/test-series")} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`bg-slate-100 dark:bg-slate-950 ${fullscreen ? "fixed inset-0 z-[60] overflow-y-auto" : "min-h-screen"}`}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold sm:text-base">{test.name}</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 font-mono text-sm font-bold sm:px-4 sm:text-base ${
                lowTime ? "animate-pulse bg-rose-500 text-white" : "bg-brand-600 text-white"
              }`}
            >
              <Clock className="h-4 w-4" /> {hh}:{mm}:{ss}
            </span>
            <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <button onClick={zoomOut} title="Zoom out" className="px-2.5 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><ZoomOut className="h-4 w-4" /></button>
              <span className="min-w-[42px] text-center text-xs font-semibold tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn} title="Zoom in" className="px-2.5 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><ZoomIn className="h-4 w-4" /></button>
            </div>
            <button onClick={toggleFullscreen} className="btn-outline px-3">
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
            <button onClick={() => setConfirmOpen(true)} className="btn-accent">Submit</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr,320px]">
        <div className="card flex flex-col p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <span className="font-bold">Question {current + 1} of {questions.length}</span>
            <div className="flex items-center gap-4">
              <FeedbackButton context="question" questionText={q.text} questionNumber={current + 1} source={testSource} question={{ ...q, chosen: answers[current] ?? null }} label="Feedback" />
              <span className="text-sm text-slate-500">
                +{(test.marks / questions.length).toFixed(1)} / -{test.negativeMarking ?? 0.25}
              </span>
            </div>
          </div>

          {q.image && <img src={q.image} alt="" className="mt-4 max-h-64 rounded-xl object-contain" />}
          <h2 className="mt-5 text-lg font-semibold leading-relaxed"><MathText>{q.text}</MathText></h2>

          {/* Matching questions show the two columns before the answer options. */}
          {q.type === "matching" && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-1 text-xs font-semibold uppercase text-brand-600 dark:text-brand-400">Column A</p>
                {(q.columnA || []).map((item, k) => (
                  <div key={k} className="flex items-start gap-1.5 py-0.5 text-sm"><span className="font-bold text-brand-700 dark:text-brand-300">{k + 1}.</span> <MathText>{item}</MathText></div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-1 text-xs font-semibold uppercase text-accent-600 dark:text-accent-400">Column B</p>
                {(q.columnB || []).map((item, k) => (
                  <div key={k} className="flex items-start gap-1.5 py-0.5 text-sm"><span className="font-bold text-accent-700 dark:text-accent-300">{toRoman(k + 1)}.</span> <MathText>{item}</MathText></div>
                ))}
              </div>
            </div>
          )}

          {/* Statement-based & pair questions render their numbered list here */}
          <StatementPairView q={q} />

          <div className="mt-5 space-y-3">
            {q.type === "matching" && <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Choose the correct matching sequence:</p>}
            {(q.options || []).map((opt, idx) => (
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
                {q.type === "matching" && <span className="font-bold">({String.fromCharCode(97 + idx)})</span>}
                <MathText>{opt}</MathText>
              </label>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex gap-2">
              <button onClick={() => goTo(Math.max(0, current - 1))} disabled={current === 0} className="btn-outline">
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button onClick={clearResponse} className="btn-ghost">Clear</button>
            </div>
            <div className="flex gap-2">
              <button onClick={markReviewNext} className="btn-outline">
                <Flag className="h-4 w-4" /> Mark & Next
              </button>
              <button onClick={saveNext} className="btn-primary">
                <Save className="h-4 w-4" /> Save & Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

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
              <button onClick={() => setConfirmOpen(false)} className="btn-outline flex-1">Resume</button>
              <button onClick={finalize} disabled={submitting} className="btn-accent flex-1">
                <CheckCircle2 className="h-4 w-4" /> {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
