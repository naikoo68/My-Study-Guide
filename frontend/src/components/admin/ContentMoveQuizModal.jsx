import { useEffect, useState } from "react";
import { X, ArrowRightLeft, Loader2, CheckCircle2 } from "lucide-react";
import { contentService } from "../../services";

// Migrate (move or copy) a WHOLE quiz to another TOPIC in the Content library —
// pick the destination by drilling Stream → Subject → Topic. Mirrors My
// Practice's "Migrate" action for Content's hierarchy. The Content "Session"
// level is hidden, so we resolve the destination topic's single implicit
// session and reuse the existing `moveQuiz` endpoint (PATCH /quizzes/:id/move).
//
// Props:
//  - open, onClose
//  - quiz:        the quiz being migrated ({ _id, title })
//  - onMoved(res): called after success so the parent can refresh
export default function ContentMoveQuizModal({ open, onClose, quiz, onMoved }) {
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sel, setSel] = useState({ stream: "", subject: "", topic: "" });
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setSel({ stream: "", subject: "", topic: "" });
    setSubjects([]); setTopics([]);
    setCopy(false); setMsg(""); setBusy(false); setResult(null);
    contentService.streams().then(setStreams).catch(() => setStreams([]));
  }, [open]);

  if (!open) return null;

  const Select = ({ value, onChange, placeholder, options, labelKey = "name", disabled }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || busy} className="input py-2 text-sm disabled:opacity-60">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o._id} value={o._id}>{o[labelKey] || o.name || o.title}</option>)}
    </select>
  );

  const doMove = async () => {
    if (!sel.topic || busy) return;
    const targetName = topics.find((t) => String(t._id) === String(sel.topic))?.title || "the topic";
    setMsg(""); setResult(null); setBusy(true);
    try {
      // Resolve (or create) the destination topic's implicit session, then reuse
      // the existing quiz-move endpoint which relocates the quiz + its questions.
      const ds = await contentService.topicSession(sel.topic);
      if (!ds?._id) throw new Error("Couldn't resolve the destination topic.");
      const res = await contentService.moveQuiz(quiz._id, { session: ds._id, copy });
      setResult({ copied: copy, name: targetName, message: res?.message });
      onMoved?.(res);
    } catch (e) {
      setMsg(e.message || "Migrate failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={busy ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="my-10 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <ArrowRightLeft className="h-5 w-5 text-brand-600" /> Migrate “{quiz?.title}”
          </h3>
          <button type="button" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></button>
        </div>

        {result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900/50 dark:bg-emerald-900/20">
            <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> {result.copied ? "Copied" : "Moved"} “{quiz?.title}” to “{result.name}”.
            </p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-200">
              {result.copied
                ? "A copy (with all its questions) now lives in the destination topic; the original stays here."
                : "The quiz and all its questions now live in the destination topic."}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Choose the destination — pick its Stream, Subject and Topic.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select
                value={sel.stream} placeholder="Stream…" options={streams}
                onChange={(v) => {
                  setSel({ stream: v, subject: "", topic: "" });
                  setSubjects([]); setTopics([]);
                  if (v) contentService.subjectsByStream(v).then(setSubjects).catch(() => setSubjects([]));
                }}
              />
              <Select
                value={sel.subject} placeholder="Subject…" options={subjects}
                onChange={(v) => {
                  setSel((s) => ({ ...s, subject: v, topic: "" }));
                  setTopics([]);
                  if (v) contentService.topics(v).then(setTopics).catch(() => setTopics([]));
                }}
              />
              <Select
                value={sel.topic} placeholder="Topic…" options={topics} labelKey="title"
                onChange={(v) => setSel((s) => ({ ...s, topic: v }))}
              />
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={copy} onChange={(e) => setCopy(e.target.checked)} disabled={busy} />
              Copy instead of move (leaves the original here)
            </label>
          </>
        )}

        {busy && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-300">
            <Loader2 className="h-4 w-4 animate-spin" /> {copy ? "Copying" : "Moving"} the quiz…
          </p>
        )}
        {msg && <p className="mt-3 text-sm font-medium text-rose-600">{msg}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {result ? (
            <button type="button" onClick={onClose} className="btn-primary">Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
              <button type="button" onClick={doMove} disabled={!sel.topic || busy} className="btn-primary disabled:opacity-50">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {copy ? "Copying" : "Moving"}…</> : <><ArrowRightLeft className="h-4 w-4" /> {copy ? "Copy here" : "Move here"}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
