import { useEffect, useState } from "react";
import { X, ArrowRightLeft, Loader2, CheckCircle2 } from "lucide-react";
import { contentService } from "../../services";

// Move / Copy the SELECTED questions from a source quiz into ANY other quiz in
// the Content library — pick the destination by drilling the full Content
// hierarchy: Stream → Subject → Topic → Session → Quiz.
//
// This is the Content-module counterpart of MoveQuestionsModal (which is wired
// to My Practice's practiceService + 4-level hierarchy). Kept separate so the
// working Practice modal is never touched.
//
// Props:
//  - open, onClose
//  - sourceQuizId: the quiz the questions currently live in (excluded as a target)
//  - questionIds:  ids to move/copy
//  - mode:         "move" (default) relocates the questions; "copy" duplicates them
//  - onMoved(res): called after success so the parent can refresh + clear selection
export default function ContentMoveQuestionsModal({ open, onClose, sourceQuizId, questionIds = [], mode = "move", onMoved }) {
  const isCopy = mode === "copy";
  const verb = isCopy ? "Copy" : "Move";
  const verbing = isCopy ? "Copying" : "Moving";
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [sel, setSel] = useState({ stream: "", subject: "", topic: "", session: "", quiz: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { moved, sourceTotal, targetTotal, name }
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setSel({ stream: "", subject: "", topic: "", session: "", quiz: "" });
    setSubjects([]); setTopics([]); setSessions([]); setQuizzes([]);
    setMsg(""); setBusy(false); setResult(null);
    contentService.streams().then(setStreams).catch(() => setStreams([]));
  }, [open]);

  if (!open) return null;

  const count = questionIds.length;
  const targetQuizzes = quizzes.filter((q) => String(q._id) !== String(sourceQuizId));

  const Select = ({ value, onChange, placeholder, options, labelKey = "name", disabled }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || busy} className="input py-2 text-sm disabled:opacity-60">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o._id} value={o._id}>{o[labelKey] || o.name || o.title}</option>)}
    </select>
  );

  const doMove = async () => {
    if (!sel.quiz || busy || !count) return;
    const targetName = quizzes.find((q) => String(q._id) === String(sel.quiz))?.title || "the quiz";
    setMsg(""); setResult(null); setBusy(true);
    try {
      const res = isCopy
        ? await contentService.copyQuestions(sourceQuizId, questionIds, sel.quiz)
        : await contentService.moveQuestions(sourceQuizId, questionIds, sel.quiz);
      setResult({ moved: res?.moved ?? res?.copied ?? count, sourceTotal: res?.sourceTotal, targetTotal: res?.targetTotal, name: targetName });
      onMoved?.(res);
    } catch (e) {
      setMsg(e.message || `${verb} failed.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={busy ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="my-10 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <ArrowRightLeft className="h-5 w-5 text-brand-600" /> {verb} {count} question{count === 1 ? "" : "s"}
          </h3>
          <button type="button" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></button>
        </div>

        {result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900/50 dark:bg-emerald-900/20">
            <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> {isCopy ? "Copied" : "Moved"} {result.moved} question{result.moved === 1 ? "" : "s"} to “{result.name}”.
            </p>
            <ul className="mt-2 space-y-0.5 text-emerald-800 dark:text-emerald-200">
              {result.sourceTotal != null && <li>• This quiz {isCopy ? "still has" : "now has"} <b>{result.sourceTotal}</b> question{result.sourceTotal === 1 ? "" : "s"}{isCopy ? "." : " remaining."}</li>}
              {result.targetTotal != null && <li>• “{result.name}” now has <b>{result.targetTotal}</b> question{result.targetTotal === 1 ? "" : "s"}.</li>}
            </ul>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Choose any destination quiz — pick its Stream, Subject, Topic, Session and Quiz.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select
                value={sel.stream} placeholder="Stream…" options={streams}
                onChange={(v) => {
                  setSel({ stream: v, subject: "", topic: "", session: "", quiz: "" });
                  setSubjects([]); setTopics([]); setSessions([]); setQuizzes([]);
                  if (v) contentService.subjectsByStream(v).then(setSubjects).catch(() => setSubjects([]));
                }}
              />
              <Select
                value={sel.subject} placeholder="Subject…" options={subjects}
                onChange={(v) => {
                  setSel((s) => ({ ...s, subject: v, topic: "", session: "", quiz: "" }));
                  setTopics([]); setSessions([]); setQuizzes([]);
                  if (v) contentService.topics(v).then(setTopics).catch(() => setTopics([]));
                }}
              />
              <Select
                value={sel.topic} placeholder="Topic…" options={topics} labelKey="title"
                onChange={(v) => {
                  setSel((s) => ({ ...s, topic: v, session: "", quiz: "" }));
                  setSessions([]); setQuizzes([]);
                  if (v) contentService.sessions(v).then(setSessions).catch(() => setSessions([]));
                }}
              />
              <Select
                value={sel.session} placeholder="Session…" options={sessions} labelKey="title"
                onChange={(v) => {
                  setSel((s) => ({ ...s, session: v, quiz: "" }));
                  setQuizzes([]);
                  if (v) contentService.quizzes(v).then(setQuizzes).catch(() => setQuizzes([]));
                }}
              />
              <select value={sel.quiz} disabled={busy} onChange={(e) => setSel((s) => ({ ...s, quiz: e.target.value }))} className="input py-2 text-sm disabled:opacity-60 sm:col-span-2">
                <option value="">Quiz…</option>
                {targetQuizzes.map((q) => <option key={q._id} value={q._id}>{q.title}</option>)}
              </select>
            </div>
            {sel.session && targetQuizzes.length === 0 && (
              <p className="mt-2 text-xs text-slate-400">No other quiz in this session — pick another session, or create a quiz there first.</p>
            )}
          </>
        )}

        {busy && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-300">
            <Loader2 className="h-4 w-4 animate-spin" /> {verbing} {count} question{count === 1 ? "" : "s"}…
          </p>
        )}
        {msg && <p className="mt-3 text-sm font-medium text-rose-600">{msg}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {result ? (
            <button type="button" onClick={onClose} className="btn-primary">Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
              <button type="button" onClick={doMove} disabled={!sel.quiz || busy || !count} className="btn-primary disabled:opacity-50">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {verbing}…</> : <><ArrowRightLeft className="h-4 w-4" /> {verb} here</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
