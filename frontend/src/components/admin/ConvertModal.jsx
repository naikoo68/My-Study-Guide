import { useEffect, useState } from "react";
import { X, Shuffle, Loader2 } from "lucide-react";
import { examService, practiceService, testService, contentService } from "../../services";

// Admin-only conversion between the platform catalogue and the practice area.
// Config-driven cascading pickers, one config per direction.
const MODES = {
  // My Test (practice) → platform Test Series
  toTestSeries: {
    title: "Move to Test Series",
    levels: [
      { key: "exam", label: "Choose exam…", load: () => examService.exams() },
      { key: "post", label: "Choose post…", load: (v) => examService.posts(v) },
    ],
    submit: (source, s) => testService.toTestSeries(source._id, { exam: s.exam, post: s.post }),
  },
  // platform Test Series → My Test (practice)
  toMyTest: {
    title: "Move to My Test",
    levels: [
      { key: "stream", label: "Choose My Test stream…", load: () => practiceService.adminStreams("test") },
      { key: "subject", label: "Choose subject…", load: (v) => practiceService.adminSubjects(v) },
    ],
    submit: (source, s) => testService.toMyTest(source._id, { practiceStream: s.stream, practiceSubject: s.subject }),
  },
  // My Quiz (practice) → platform Quiz — choose Stream ▸ Subject ▸ Topic ▸ Session
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
  // platform Quiz → My Quiz (practice)
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

export default function ConvertModal({ open, mode, source, onClose, onDone }) {
  const cfg = MODES[mode];
  const [opts, setOpts] = useState([]); // options per level index
  const [sel, setSel] = useState([]); // selected id per level index
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!open || !cfg) return;
    setSel([]);
    setMsg("");
    setOpts([]);
    setOk(false);
    cfg.levels[0].load().then((r) => setOpts([r || []])).catch(() => setOpts([[]]));
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !cfg) return null;

  const pick = (i, value) => {
    const nextSel = sel.slice(0, i);
    nextSel[i] = value;
    setSel(nextSel);
    const nextOpts = opts.slice(0, i + 1);
    setOpts(nextOpts);
    const nextLevel = cfg.levels[i + 1];
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

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-10 w-full max-w-md animate-scale-in card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Shuffle className="h-5 w-5 text-brand-600" /> {cfg.title}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 truncate text-sm text-slate-500 dark:text-slate-400">{source?.name}</p>

        <div className="space-y-3">
          {cfg.levels.map((lv, i) => {
            const list = opts[i];
            const shown = i === 0 || sel[i - 1]; // only show once the parent is picked
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
                    Nothing here yet — create one first{i === 0 ? (mode === "toTestSeries" ? " (add an Exam under Test Series)" : (mode === "toQuiz" || mode === "moveQuiz") ? " (add a Stream under Content)" : "") : ""}.
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
      </div>
    </div>
  );
}
