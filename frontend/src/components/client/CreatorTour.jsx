import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authService, practiceService } from "../../services";

// First-run CREATOR coach-mark tour. Instead of a popup that does the work, this
// makes the REAL buttons blink/pulse and points the creator through the flow,
// one target at a time, using their own workspace:
//   1. Build         → pulses the menu / Build tab (open the builder)
//   2. Add Stream    → pulses "Add Stream"
//   3. Add Subject   → pulses "Add Subject" (once they've opened their stream)
//   4. Add Topic     → pulses "Add Topic"
//   5. Add Quiz      → pulses "Add Quiz"
//   6. Generate      → pulses the AI Generator (generate a question with AI)
//
// Targets are found by `data-tour="…"` attributes on the real elements. The
// pulsing ring is pointer-events-none so the creator can still tap the button
// underneath. Each step auto-advances from the creator's actual content (a
// stream/subject/topic/quiz/question appearing), and a persistent hint bar shows
// the current instruction even when the target isn't on screen yet (e.g. "open
// your stream first"). When a question exists the tour marks itself complete
// server-side so it never shows again.
//
// Props: `tab` (active workspace tab) and `menuOpen` (hamburger open?) — used to
// know when the builder is open and to re-find targets as the menu toggles.
const STEPS = [
  { k: "build",   targets: ["nav-build", "nav-menu"], hint: "Open the menu, then tap Build to start building." },
  { k: "stream",  targets: ["add-streams"],           hint: 'Tap "Add Stream" to create your first stream.' },
  { k: "subject", targets: ["add-subjects"],          hint: 'Open your stream (then an exam for My Quiz), and tap "Add Subject".' },
  { k: "topic",   targets: ["add-topics"],            hint: 'Open your subject, then tap "Add Topic".' },
  { k: "quiz",    targets: ["add-items"],             hint: 'Open your topic, then tap "Add Quiz".' },
  { k: "generate",targets: ["nav-aigen", "nav-menu"], hint: "Open the menu → AI Generator, then generate a question with AI." },
];

async function anyTopicExists(streamsWithSubjects) {
  for (const s of streamsWithSubjects) {
    const subs = await practiceService.adminSubjects(s._id).catch(() => []);
    for (const sub of subs) {
      const topics = await practiceService.adminTopics(sub._id).catch(() => []);
      if (topics.length) return true;
    }
  }
  return false;
}

export default function CreatorTour({ tab, menuOpen }) {
  const { refreshUser } = useAuth();
  const [counts, setCounts] = useState({ stream: false, subject: false, topic: false, quiz: false, question: false });
  const [rect, setRect] = useState(null);
  const completedRef = useRef(false);

  // Detect the creator's content so steps tick off as they build. Monotonic:
  // a deeper level existing implies the shallower ones do, so we only walk as
  // deep as needed.
  const detect = useCallback(async () => {
    const items = await practiceService.myItems().catch(() => []);
    const quizzes = (items || []).filter((i) => i.kind === "quiz");
    const questionTotal = (items || []).reduce((s, i) => s + (i.questionCount || 0), 0);
    let stream = false, subject = false, topic = false, quiz = false, question = false;
    if (questionTotal >= 1) {
      stream = subject = topic = quiz = question = true;
    } else if (quizzes.length >= 1) {
      stream = subject = topic = quiz = true;
    } else {
      const streams = await practiceService.adminStreams("quiz").catch(() => []);
      if (streams.length) {
        stream = true;
        const withSubjects = streams.filter((s) => (s.subjects || 0) > 0);
        if (withSubjects.length) { subject = true; topic = await anyTopicExists(withSubjects); }
      }
    }
    setCounts({ stream, subject, topic, quiz, question });
  }, []);

  useEffect(() => {
    detect();
    const id = setInterval(detect, 2500);
    const onFocus = () => detect();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [detect]);

  // Per-step completion (build is done once they're in the builder or have a stream).
  const done = {
    build: tab === "build" || counts.stream,
    stream: counts.stream,
    subject: counts.subject,
    topic: counts.topic,
    quiz: counts.quiz,
    generate: counts.question,
  };
  const activeIndex = STEPS.findIndex((s) => !done[s.k]);
  const allDone = activeIndex === -1;
  const step = allDone ? null : STEPS[activeIndex];

  // Follow the current target's on-screen position so the ring stays on it.
  useEffect(() => {
    const update = () => {
      let el = null;
      if (step) {
        for (const sel of step.targets) {
          const e = document.querySelector(`[data-tour="${sel}"]`);
          if (e && e.offsetParent !== null) { el = e; break; }
        }
      }
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
    };
    update();
    const id = setInterval(update, 150);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { clearInterval(id); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [step, menuOpen]);

  // Finish once a question exists — persist so the tour never returns.
  useEffect(() => {
    if (!allDone || completedRef.current) return;
    completedRef.current = true;
    (async () => {
      try { await authService.completeCreatorGuide(); await refreshUser?.(); } catch { /* retry next load */ }
    })();
  }, [allDone, refreshUser]);

  const skip = async () => {
    completedRef.current = true;
    try { await authService.completeCreatorGuide(); await refreshUser?.(); } catch { /* ignore */ }
  };

  if (allDone) return null;

  const stepNo = activeIndex + 1;
  const total = STEPS.length;
  const pad = 6;
  // Tooltip sits below the target when there's room, otherwise above.
  const below = rect ? rect.top + rect.height + 90 < window.innerHeight : true;
  const tipTop = rect ? (below ? rect.top + rect.height + pad + 10 : rect.top - pad - 56) : 0;
  const tipLeft = rect ? Math.max(12, Math.min(rect.left, window.innerWidth - 268)) : 0;

  return (
    <>
      {/* Pulsing ring over the current target (click-through). */}
      {rect && (
        <>
          <div
            className="pointer-events-none fixed z-[70]"
            style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          >
            <div className="absolute inset-0 rounded-xl ring-4 ring-brand-500/80 animate-pulse" />
            <div className="absolute inset-0 rounded-xl ring-4 ring-brand-400 animate-ping" />
          </div>
          {/* Tooltip anchored to the target */}
          <div
            className="pointer-events-none fixed z-[71] w-64 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-xl dark:bg-slate-800"
            style={{ top: tipTop, left: tipLeft }}
          >
            <span className="font-bold text-brand-300">Step {stepNo}/{total}</span> · {step.hint}
          </div>
        </>
      )}

      {/* Persistent hint bar — always tells them the current action, even when
          the target isn't on screen yet (so they know where to navigate). */}
      <div className="fixed bottom-4 left-1/2 z-[70] flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-2.5 shadow-lg dark:border-brand-900/50 dark:bg-slate-900">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-accent-500 text-xs font-bold text-white">{stepNo}</span>
        <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{step.hint}</p>
        <button type="button" onClick={skip} className="flex-shrink-0 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Skip</button>
      </div>
    </>
  );
}
