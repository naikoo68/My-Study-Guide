import { useEffect, useState } from "react";
import { X, Shuffle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { examService, practiceService, testService, contentService } from "../../services";

// One modal for every "move" destination. Config-driven cascading pickers, one
// config per destination `mode`. When several destinations are possible the
// caller passes `options` and the user first chooses WHERE, then the location.
const MODES = {
  // ---- Convert between platform catalogue and practice ----
  toTestSeries: {
    title: "Move to Test Series",
    levels: [
      { key: "exam", label: "Choose exam…", load: () => examService.exams() },
      { key: "post", label: "Choose post…", load: (v) => examService.posts(v) },
    ],
    submit: (source, s) => testService.toTestSeries(source._id, { exam: s.exam, post: s.post }),
  },
  toMyTest: {
    title: "Move to My Test",
    levels: [
      { key: "stream", label: "Choose My Test stream…", load: () => practiceService.adminStreams("test") },
      { key: "subject", label: "Choose subject…", load: (v) => practiceService.adminSubjects(v) },
    ],
    submit: (source, s) => testService.toMyTest(source._id, { practiceStream: s.stream, practiceSubject: s.subject }),
  },
  toQuiz: {
    title: "Move to Quiz",
    levels: [
      { key: "stream", label: "Choose stream…", load: () => contentService.streams() },
      { key: "subject", label: "Choose subject…", load: (v) => contentService.subjectsByStream(v) },
      { key: "topic", label: "Choose topic…", load: (v) => contentService.topics(v), labelKey: "title" },
      { key: "session", label: "Choose session…", load: (v) => contentService.sessions(v), labelKey: "title" },
    ],
    submit: (source, s) => testService.toQuiz(source._id, { session: s.session }),
  },
  toMyQuiz: {
    title: "Move to My Quiz",
    levels: [
      { key: "stream", label: "Choose My Quiz stream…", load: () => practiceService.adminStreams("quiz") },
      { key: "subject", label: "Choose subject…", load: (v) => practiceService.adminSubjects(v) },
      { key: "topic", label: "Choose topic…", load: (v) => practiceService.adminTopics(v) },
    ],
    submit: (source, s) =>
      testService.quizToMyQuiz(source._id, { practiceStream: s.stream, practiceSubject: s.subject, practiceTopic: s.topic }),
  },

  // ---- Re-parent a practice item (My Quiz / My Test) within practice ----
  moveMyQuiz: {
    title: "Move within My Quiz",
    levels: [
      { key: "stream", label: "Choose stream…", load: () => practiceService.adminStreams("quiz") },
      { key: "subject", label: "Choose subject…", load: (v) => practiceService.adminSubjects(v) },
      { key: "topic", label: "Choose topic…", load: (v) => practiceService.adminTopics(v) },
    ],
    submit: (source, s) =>
      practiceService.moveItem(source._id, { practiceStream: s.stream, practiceSubject: s.subject, practiceTopic: s.topic }),
  },
  moveMyTest: {
    title: "Move within My Test",
    levels: [
      { key: "stream", label: "Choose stream…", load: () => practiceService.adminStreams("test") },
      { key: "subject", label: "Choose subject…", load: (v) => practiceService.adminSubjects(v) },
    ],
    submit: (source, s) => practiceService.moveItem(source._id, { practiceStream: s.stream, practiceSubject: s.subject }),
  },

  // ---- Re-parent within the platform quiz hierarchy ----
  moveSubject: {
    title: "Move subject to another stream",
    levels: [{ key: "stream", label: "Choose stream…", load: () => contentService.streams() }],
    submit: (source, s) => contentService.moveSubject(source._id, s.stream),
  },
  moveTopic: {
    title: "Move topic to another subject",
    levels: [
      { key: "stream", label: "Choose stream…", load: () => contentService.streams() },
      { key: "subject", label: "Choose subject…", load: (v) => contentService.subjectsByStream(v) },
    ],
    submit: (source, s) => contentService.moveTopic(source._id, s.subject),
  },
  moveQuiz: {
    title: "Move quiz to another session",
    levels: [
      { key: "stream", label: "Choose stream…", load: () => contentService.streams() },
      { key: "subject", label: "Choose subject…", load: (v) => contentService.subjectsByStream(v) },
      { key: "topic", label: "Choose topic…", load: (v) => contentService.topics(v), labelKey: "title" },
      { key: "session", label: "Choose session…", load: (v) => contentService.sessions(v), labelKey: "title" },
    ],
    submit: (source, s) => contentService.moveQuiz(source._id, s.session),
  },
};

// Props:
//   mode      – a single destination mode (skips the chooser), OR
//   options   – [{ mode, label }] destinations to choose from first
//   source    – { _id, name }
export default function ConvertModal({ open, mode, options, source, onClose, onDone }) {
  const [activeMode, setActiveMode] = useState("");
  const [opts, setOpts] = useState([]); // options per level index
  const [sel, setSel] = useState([]); // selected id per level index
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  const multi = Array.isArray(options) && options.length > 1;

  // Decide the starting mode when the modal opens.
  useEffect(() => {
    if (!open) return;
    const init = mode || (Array.isArray(options) && options.length === 1 ? options[0].mode : "");
    setActiveMode(init);
    setSel([]);
    setOpts([]);
    setMsg("");
    setOk(false);
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = MODES[activeMode];

  // Load the first level whenever a destination mode becomes active.
  useEffect(() => {
    if (!open || !cfg) return;
    setSel([]);
    setOpts([]);
    setMsg("");
    cfg.levels[0].load().then((r) => setOpts([r || []])).catch(() => setOpts([[]]));
  }, [open, activeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const pick = (i, value) => {
    const nextSel = sel.slice(0, i);
    nextSel[i] = value;
    setSel(nextSel);
    const nextLevel = cfg.levels[i + 1];
    setOpts((o) => o.slice(0, i + 1));
    if (value && nextLevel) {
      nextLevel.load(value).then((r) => setOpts((o) => { const c = o.slice(0, i + 1); c[i + 1] = r || []; return c; })).catch(() => {});
    }
  };

  const submit = async () => {
    if (cfg.levels.some((_, i) => !sel[i])) {
      setMsg("Choose the full destination.");
      return;
    }
    const byKey = {};
    cfg.levels.forEach((lv, i) => (byKey[lv.key] = sel[i]));
    setBusy(true);
    setMsg("");
    try {
      await cfg.submit(source, byKey);
      setOk(true);
      setMsg("✓ Moved successfully.");
      onDone?.();
      setTimeout(onClose, 1200);
    } catch (e) {
      setMsg(e.message || "Couldn't move.");
    } finally {
      setBusy(false);
    }
  };

  const chooser = !activeMode && Array.isArray(options) && options.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-10 w-full max-w-md animate-scale-in card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Shuffle className="h-5 w-5 text-brand-600" /> {chooser ? "Move — choose destination" : cfg?.title || "Move"}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 truncate text-sm text-slate-500 dark:text-slate-400">{source?.name}</p>

        {chooser ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Where do you want to move it?</p>
            {options.map((o) => (
              <button
                key={o.mode}
                type="button"
                onClick={() => setActiveMode(o.mode)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-left hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-900/20"
              >
                <span className="font-semibold">{o.label}</span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </div>
        ) : (
          <>
            {multi && (
              <button
                type="button"
                onClick={() => { setActiveMode(""); setSel([]); setOpts([]); setMsg(""); }}
                className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-600"
              >
                <ChevronLeft className="h-4 w-4" /> Change destination
              </button>
            )}
            <div className="space-y-3">
              {cfg?.levels.map((lv, i) => {
                const list = opts[i];
                const shown = i === 0 || sel[i - 1];
                const emptyLoaded = shown && Array.isArray(list) && list.length === 0;
                return (
                  <div key={lv.key}>
                    <select
                      value={sel[i] || ""}
                      onChange={(e) => pick(i, e.target.value)}
                      disabled={i > 0 && !sel[i - 1]}
                      className="input"
                    >
                      <option value="">{lv.label}</option>
                      {(list || []).map((o) => (
                        <option key={o._id} value={o._id}>{o[lv.labelKey || "name"] || o.name || o.title}</option>
                      ))}
                    </select>
                    {emptyLoaded && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Nothing here yet — create one first
                        {i === 0 ? (activeMode === "toTestSeries" ? " (add an Exam under Test Series)" : (activeMode === "toQuiz" || activeMode === "moveQuiz") ? " (add a Stream under Content)" : "") : ""}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {msg && <p className={`mt-3 text-sm font-medium ${ok ? "text-emerald-600" : "text-rose-600"}`}>{msg}</p>}

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="btn-outline">Close</button>
              <button type="button" onClick={submit} disabled={busy || ok} className="btn-primary">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Moving…</> : "Move"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
