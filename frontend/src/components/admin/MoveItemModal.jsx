import { useEffect, useState } from "react";
import { X, Move, Loader2 } from "lucide-react";
import { practiceService } from "../../services";

// Move practice content to a new location (owner-scoped). Handles three cases:
//   type="item"    → a My Quiz / My Test item → Stream ▸ Subject ▸ (Topic)
//   type="subject" → a whole subject          → Stream
//   type="topic"   → a whole topic (My Quiz)   → Stream ▸ Subject
export default function MoveItemModal({ open, type = "item", node, kind = "quiz", onClose, onDone }) {
  const effectiveKind = type === "item" ? node?.practiceKind || node?.kind || kind : type === "topic" ? "quiz" : kind;
  const needSubject = type === "item" || type === "topic";
  const needTopic = type === "item" && effectiveKind === "quiz";

  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sel, setSel] = useState({ stream: "", subject: "", topic: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setSel({ stream: "", subject: "", topic: "" });
    setSubjects([]);
    setTopics([]);
    setMsg("");
    practiceService.adminStreams(effectiveKind).then(setStreams).catch(() => setStreams([]));
  }, [open, effectiveKind]);

  if (!open) return null;

  const pickStream = (v) => {
    setSel({ stream: v, subject: "", topic: "" });
    setSubjects([]);
    setTopics([]);
    if (v && needSubject) practiceService.adminSubjects(v).then(setSubjects).catch(() => setSubjects([]));
  };
  const pickSubject = (v) => {
    setSel((s) => ({ ...s, subject: v, topic: "" }));
    setTopics([]);
    if (v && needTopic) practiceService.adminTopics(v).then(setTopics).catch(() => setTopics([]));
  };

  const submit = async () => {
    try {
      if (type === "subject") {
        if (!sel.stream) return setMsg("Choose a destination stream.");
        setBusy(true);
        await practiceService.moveSubject(node._id, sel.stream);
      } else if (type === "topic") {
        if (!sel.subject) return setMsg("Choose a destination subject.");
        setBusy(true);
        await practiceService.moveTopic(node._id, sel.subject);
      } else {
        if (!sel.stream || !sel.subject || (needTopic && !sel.topic)) return setMsg("Choose the full destination.");
        setBusy(true);
        await practiceService.moveItem(node._id, {
          practiceStream: sel.stream,
          practiceSubject: sel.subject,
          practiceTopic: needTopic ? sel.topic : undefined,
        });
      }
      onDone?.();
      onClose();
    } catch (e) {
      setMsg(e.message || "Couldn't move.");
    } finally {
      setBusy(false);
    }
  };

  const label = type === "subject" ? "subject" : type === "topic" ? "topic" : effectiveKind === "quiz" ? "quiz" : "test";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-10 w-full max-w-md animate-scale-in card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Move className="h-5 w-5 text-brand-600" /> Move {label}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 truncate text-sm text-slate-500 dark:text-slate-400">{node?.name}</p>

        <div className="space-y-3">
          <select value={sel.stream} onChange={(e) => pickStream(e.target.value)} className="input">
            <option value="">{type === "subject" ? "Destination stream…" : "Stream…"}</option>
            {streams.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          {needSubject && (
            <select value={sel.subject} onChange={(e) => pickSubject(e.target.value)} className="input" disabled={!sel.stream}>
              <option value="">{type === "topic" ? "Destination subject…" : "Subject…"}</option>
              {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          )}
          {needTopic && (
            <select value={sel.topic} onChange={(e) => setSel((s) => ({ ...s, topic: e.target.value }))} className="input" disabled={!sel.subject}>
              <option value="">Destination topic…</option>
              {topics.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          )}
        </div>

        {msg && <p className="mt-3 text-sm font-medium text-rose-600">{msg}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="btn-primary">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Moving…</> : "Move here"}
          </button>
        </div>
      </div>
    </div>
  );
}
