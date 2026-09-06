// Slideshow quiz player — presents questions in a slideshow / presentation style.

import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Maximize,
  Minimize,
  Clock,
  CheckCircle2,
  Lightbulb,
  Film,
  Settings2,
  Repeat,
  Download,
} from "lucide-react";
import MathText from "../ui/MathText";
import OptionContent from "../ui/OptionContent";
import StatementPairView from "../ui/StatementPairView";
import TableView from "../ui/TableView";
import GraphView from "../ui/GraphView";
import VizView from "../ui/VizView";
import AssertionReasonView from "../ui/AssertionReasonView";
import Watermark from "../ui/Watermark";
import { stemText, displayOptions } from "../../lib/questions";
import { shuffleAll, makeSeed } from "../../lib/shuffleOptions";
import { useSettings } from "../../context/SettingsContext";

const optionLabels = ["A", "B", "C", "D"];

function toRoman(num) {
  const map = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
  let r = "";
  for (const [s, v] of map) while (num >= v) { r += s; num -= v; }
  return r;
}

// A small SVG ring that fills as the current phase's timer counts down. Purely
// visual — gives recordings a clean, obvious "time remaining" cue.
function CountdownRing({ remaining, total, label }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-200 dark:text-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={remaining <= 3 ? "text-rose-500" : "text-brand-500"}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-black tabular-nums">{Math.ceil(remaining)}</span>
        {label && <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>}
      </div>
    </div>
  );
}

const DURATION_CHOICES = [3, 5, 6, 8, 10, 12, 15, 20];

// Reusable slideshow / presentation player. Given a ready list of `questions`
// (each with options, `correct` index and `explanation`), it auto-advances
// question → answer on configurable timers — built for screen-recording a video
// tutorial. Data loading lives in the parent page; this component only plays.
//   props:
//     questions  — array of question objects (non-empty)
//     quizTitle  — heading shown on the setup + intro slides
//     crumb      — optional breadcrumb string
//     backTo     — route to navigate to on Back / Exit
export default function SlideshowPlayer({ questions = [], quizTitle = "Quiz", crumb = "", backTo = "/" }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [seed] = useState(() => makeSeed());

  const [config, setConfig] = useState({
    questionSecs: 8,
    answerSecs: 6,
    showExplanation: true,
    shuffleOptions: false,
    loop: false,
    showIntro: true,
    showOutro: true,
  });
  const [started, setStarted] = useState(false);

  const [stage, setStage] = useState("intro"); // "intro" | "q" | "outro"
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("show"); // "show" | "reveal"
  const [remaining, setRemaining] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recError, setRecError] = useState("");
  const containerRef = useRef(null);
  const lastTickRef = useRef(null);
  const remainingRef = useRef(0);
  const hideTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const siteName = settings?.siteName || "My Study Guide";

  const [slides, setSlides] = useState(questions);
  useEffect(() => {
    setSlides(config.shuffleOptions ? shuffleAll(questions, seed) : questions);
  }, [questions, config.shuffleOptions, seed]);

  const phaseDuration = useCallback(
    (st, ph) => {
      if (st === "intro") return 4;
      if (st === "outro") return 5;
      return ph === "show" ? config.questionSecs : config.answerSecs;
    },
    [config.questionSecs, config.answerSecs]
  );

  const goToStage = useCallback((st, idx, ph) => {
    const dur = phaseDuration(st, ph);
    setStage(st);
    if (idx != null) setIndex(idx);
    if (ph != null) setPhase(ph);
    remainingRef.current = dur;
    setRemaining(dur);
    lastTickRef.current = null;
  }, [phaseDuration]);

  // Reached the natural end. Stop playback and, if we're recording a video,
  // stop the recorder — which triggers the download in its onstop handler.
  const finish = useCallback(() => {
    setPlaying(false);
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const advance = useCallback(() => {
    if (stage === "intro") { goToStage("q", 0, "show"); return; }
    if (stage === "q") {
      if (phase === "show") { goToStage("q", index, "reveal"); return; }
      if (index < slides.length - 1) goToStage("q", index + 1, "show");
      else if (config.showOutro) goToStage("outro");
      else if (config.loop) goToStage(config.showIntro ? "intro" : "q", 0, "show");
      else finish();
      return;
    }
    if (stage === "outro") {
      if (config.loop) goToStage(config.showIntro ? "intro" : "q", 0, "show");
      else finish();
    }
  }, [stage, phase, index, slides.length, config.showOutro, config.showIntro, config.loop, goToStage, finish]);

  const goBack = useCallback(() => {
    if (stage === "q" && phase === "reveal") { goToStage("q", index, "show"); return; }
    if (stage === "q" && phase === "show") {
      if (index > 0) goToStage("q", index - 1, "reveal");
      else if (config.showIntro) goToStage("intro");
      return;
    }
    if (stage === "outro") { goToStage("q", slides.length - 1, "reveal"); return; }
  }, [stage, phase, index, slides.length, config.showIntro, goToStage]);

  useEffect(() => {
    if (!playing) { lastTickRef.current = null; return; }
    const id = setInterval(() => {
      const now = Date.now();
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const dt = (now - last) / 1000;
      const next = remainingRef.current - dt;
      if (next <= 0) {
        remainingRef.current = 0;
        setRemaining(0);
        advance();
      } else {
        remainingRef.current = next;
        setRemaining(next);
      }
    }, 100);
    return () => clearInterval(id);
  }, [playing, advance]);

  const begin = () => {
    setStarted(true);
    goToStage(config.showIntro ? "intro" : "q", 0, "show");
    setPlaying(true);
  };

  const restart = () => {
    goToStage(config.showIntro ? "intro" : "q", 0, "show");
    setPlaying(true);
  };

  // Record the slideshow to a downloadable video, entirely in the browser.
  // Uses the Screen Capture API: the user shares this tab, we play the show
  // start-to-finish, then a .webm file downloads automatically at the end.
  const startRecording = async () => {
    setRecError("");
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setRecError("Your browser can't record here. Use the latest Chrome or Edge on desktop — or just screen-record manually while it plays.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    } catch {
      setRecError("Screen sharing was cancelled. To download a video, allow sharing and pick “This Tab”.");
      return;
    }
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(quizTitle || "quiz").replace(/[^\w-]+/g, "_")}-slideshow.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setRecording(false);
      mediaRecorderRef.current = null;
    };
    // If the user stops sharing from the browser's own bar, wrap up cleanly.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (rec.state !== "inactive") rec.stop();
    });
    mediaRecorderRef.current = rec;
    rec.start();
    setRecording(true);
    // Force a clean, finite run: no loop and keep the outro so recording ends.
    setConfig((c) => ({ ...c, loop: false, showOutro: true }));
    setControlsVisible(false);
    setStarted(true);
    goToStage(config.showIntro ? "intro" : "q", 0, "show");
    setPlaying(true);
  };

  const togglePlay = () => {
    if (!playing && stage === "outro") { restart(); return; }
    if (!playing && stage === "q" && phase === "reveal" && index === slides.length - 1 && !config.showOutro) {
      restart();
      return;
    }
    lastTickRef.current = null;
    setPlaying((p) => !p);
  };

  const toggleFullscreen = () => {
    if (!fullscreen) {
      setFullscreen(true);
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      setFullscreen(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  };
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const nudgeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2500);
  }, [playing]);
  useEffect(() => {
    nudgeControls();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [playing, stage, phase, index, nudgeControls]);

  useEffect(() => {
    if (!started) return;
    const onKey = (e) => {
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") goBack();
      else if (e.key.toLowerCase() === "f") toggleFullscreen();
      else if (e.key.toLowerCase() === "r") restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, advance, goBack]);

  // ---------------- Setup screen ----------------
  if (!started) {
    const est = (config.showIntro ? 4 : 0) + (config.showOutro ? 5 : 0) +
      questions.length * (config.questionSecs + config.answerSecs);
    const mins = Math.floor(est / 60);
    const secs = est % 60;
    return (
      <div className="container-page py-10">
        <button onClick={() => navigate(backTo)} className="btn-ghost -ml-2 mb-6">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="mx-auto max-w-xl card p-8">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
              <Film className="h-7 w-7" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold">Slideshow — {quizTitle}</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              {questions.length} questions · Auto-plays each question, then reveals the answer. Perfect for screen-recording a YouTube video.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-brand-600" /> Show each question for
              </label>
              <div className="flex flex-wrap gap-2">
                {DURATION_CHOICES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setConfig((c) => ({ ...c, questionSecs: s }))}
                    className={`rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition ${
                      config.questionSecs === s
                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                        : "border-slate-200 hover:border-brand-300 dark:border-slate-700"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Show the answer for
              </label>
              <div className="flex flex-wrap gap-2">
                {DURATION_CHOICES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setConfig((c) => ({ ...c, answerSecs: s }))}
                    className={`rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition ${
                      config.answerSecs === s
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
                        : "border-slate-200 hover:border-emerald-300 dark:border-slate-700"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {[
                { key: "showExplanation", label: "Show explanation on reveal" },
                { key: "shuffleOptions", label: "Shuffle option order" },
                { key: "showIntro", label: "Title intro slide" },
                { key: "showOutro", label: "Outro slide" },
                { key: "loop", label: "Loop when finished" },
              ].map((t) => (
                <label key={t.key} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={config[t.key]}
                    onChange={(e) => setConfig((c) => ({ ...c, [t.key]: e.target.checked }))}
                  />
                  {t.label}
                </label>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <Settings2 className="mr-1.5 inline h-4 w-4" />
              Estimated length: <span className="font-semibold text-slate-700 dark:text-slate-200">{mins}m {secs}s</span>.
              Tip: press <kbd className="rounded bg-white px-1 dark:bg-slate-700">F</kbd> for full screen,
              <kbd className="ml-1 rounded bg-white px-1 dark:bg-slate-700">Space</kbd> to pause, then start your screen recorder.
            </div>

            <button onClick={begin} className="btn-primary w-full justify-center py-3 text-base">
              <Play className="h-5 w-5" /> Start slideshow
            </button>

            <button
              onClick={startRecording}
              disabled={recording}
              className="btn-outline w-full justify-center py-3 text-base disabled:opacity-60"
            >
              <Download className="h-5 w-5" /> {recording ? "Recording…" : "Record & download video"}
            </button>
            {recError && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{recError}</p>}
            <p className="text-xs text-slate-400">
              Downloading records this tab: when asked, share <b>“This Tab”</b>. The slideshow plays start-to-finish and a
              <b> .webm</b> video saves automatically at the end. (Works in Chrome/Edge on desktop.)
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Playback ----------------
  const q = slides[index];
  const isMatching = q?.type === "matching";
  const reveal = stage === "q" && phase === "reveal";
  const total = phaseDuration(stage, phase);

  const optionClass = (idx) => {
    const base = "flex w-full items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left text-lg font-medium transition-all duration-300";
    if (!reveal) return `${base} border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900`;
    if (idx === q.correct) return `${base} border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100`;
    return `${base} border-slate-200 bg-white opacity-50 dark:border-slate-700 dark:bg-slate-900`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={nudgeControls}
      onTouchStart={nudgeControls}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950"
    >
      <Watermark />

      <div className="absolute inset-x-0 top-0 z-10 h-1.5 bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full bg-brand-500 transition-all duration-200"
          style={{ width: `${((index + (reveal ? 1 : 0.5)) / slides.length) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
        {stage === "intro" && (
          <div className="animate-fade-in text-center">
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-brand-500">{siteName}</p>
            <h1 className="mt-4 text-4xl font-black sm:text-6xl">{quizTitle}</h1>
            {crumb && <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">{crumb}</p>}
            <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-100 px-5 py-2 text-lg font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              {slides.length} Questions
            </p>
          </div>
        )}

        {stage === "outro" && (
          <div className="animate-fade-in text-center">
            <h1 className="text-4xl font-black sm:text-6xl">Thanks for watching!</h1>
            <p className="mt-4 text-xl text-slate-500 dark:text-slate-400">
              Like &amp; subscribe for more practice quizzes.
            </p>
            <p className="mt-8 text-sm font-bold uppercase tracking-[0.3em] text-brand-500">{siteName}</p>
          </div>
        )}

        {stage === "q" && q && (
          <div className="mx-auto w-full max-w-4xl animate-fade-in">
            <div className="mb-4 flex items-center justify-between text-sm font-semibold text-slate-400">
              <span>Question {index + 1} of {slides.length}</span>
              {crumb && <span className="hidden truncate sm:block">{crumb}</span>}
            </div>

            {q.image && <img src={q.image} alt="" className="mb-5 max-h-72 rounded-2xl object-contain" />}
            <h2 className="text-2xl font-bold leading-relaxed sm:text-3xl">
              <MathText>{stemText(q)}</MathText>
            </h2>

            {isMatching && (
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Column A</p>
                  <div className="space-y-2">
                    {(q.columnA || []).map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-base"><span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{i + 1}</span><MathText>{item}</MathText></div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-600 dark:text-accent-400">Column B</p>
                  <div className="space-y-2">
                    {(q.columnB || []).map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-base"><span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-accent-100 text-xs font-bold text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">{toRoman(i + 1)}</span><MathText>{item}</MathText></div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <StatementPairView q={q} />
            <TableView q={q} />
            <GraphView q={q} />
            <VizView q={q} />
            <AssertionReasonView q={q} />

            <div className="mt-6 space-y-3">
              {displayOptions(q).map((opt, idx) => {
                const optExp = q.optionExplanations?.[idx];
                return (
                  <div key={idx}>
                    <div className={optionClass(idx)}>
                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border text-sm font-bold ${
                          reveal && idx === q.correct
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        {isMatching ? `(${String.fromCharCode(97 + idx)})` : optionLabels[idx]}
                      </span>
                      <span className="flex-1"><OptionContent>{opt}</OptionContent></span>
                      {reveal && idx === q.correct && <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-emerald-500" />}
                    </div>
                    {/* Why this incorrect option is wrong (shown on reveal). */}
                    {reveal && config.showExplanation && idx !== q.correct && optExp && optExp.trim() && (
                      <p className="ml-3 mt-1 rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                        <MathText>{optExp}</MathText>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {reveal && config.showExplanation && q.explanation && (
              <div className="mt-5 animate-fade-in rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-900/20">
                <div className="flex items-center gap-2 text-lg font-semibold text-amber-700 dark:text-amber-300">
                  <Lightbulb className="h-5 w-5" /> Explanation
                </div>
                <p className="mt-2 text-base text-amber-900/90 dark:text-amber-100/90"><MathText>{q.explanation}</MathText></p>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-3 p-4 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <button onClick={() => navigate(backTo)} title="Exit" className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={goBack} title="Previous (←)" className="rounded-xl p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={togglePlay} title="Play / Pause (Space)" className="rounded-xl bg-brand-600 p-3 text-white hover:bg-brand-700">
            {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </button>
          <button onClick={advance} title="Next (→)" className="rounded-xl p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronRight className="h-5 w-5" />
          </button>

          {stage === "q" && (
            <div className="px-1">
              <CountdownRing remaining={remaining} total={total} label={reveal ? "answer" : "read"} />
            </div>
          )}

          <button onClick={restart} title="Restart (R)" className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            onClick={() => setConfig((c) => ({ ...c, loop: !c.loop }))}
            title="Toggle loop"
            className={`rounded-xl p-2.5 ${config.loop ? "text-brand-600" : "text-slate-500"} hover:bg-slate-100 dark:hover:bg-slate-800`}
          >
            <Repeat className="h-5 w-5" />
          </button>
          <button onClick={toggleFullscreen} title="Full screen (F)" className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
