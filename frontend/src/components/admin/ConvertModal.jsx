import { useEffect, useState } from "react";
import { X, Shuffle, Loader2 } from "lucide-react";
import { examService, practiceService, testService } from "../../services";

// Admin-only conversion between a platform Test Series and a My Test (practice).
// Both are the same underlying doc, so questions are preserved.
//   mode="toTestSeries" : My Test → Test Series  (pick Exam ▸ Post)
//   mode="toMyTest"     : Test Series → My Test  (pick My-Test Stream ▸ Subject)
export default function ConvertModal({ open, mode, source, onClose, onDone }) {
  const [a, setA] = useState([]);
  const [b, setB] = useState([]);
  const [sel, setSel] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setSel({ a: "", b: "" });
    setB([]);
    setMsg("");
    if (mode === "toTestSeries") examService.exams().then(setA).catch(() => setA([]));
    else if (mode === "toMyTest") practiceService.adminStreams("test").then(setA).catch(() => setA([]));
  }, [open, mode]);

  if (!open) return null;

  const pickA = (v) => {
    setSel({ a: v, b: "" });
    setB([]);
    if (!v) return;
    if (mode === "toTestSeries") examService.posts(v).then(setB).catch(() => setB([]));
    else if (mode === "toMyTest") practiceService.adminSubjects(v).then(setB).catch(() => setB([]));
  };

  const submit = async () => {
    if (!sel.a || !sel.b) {
      setMsg("Choose the destination.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      if (mode === "toTestSeries") await testService.toTestSeries(source._id, { exam: sel.a, post: sel.b });
      else if (mode === "toMyTest") await testService.toMyTest(source._id, { practiceStream: sel.a, practiceSubject: sel.b });
      onDone?.();
      onClose();
    } catch (e) {
      setMsg(e.message || "Couldn't convert.");
    } finally {
      setBusy(false);
    }
  };

  const cfg =
    mode === "toTestSeries"
      ? { title: "Move to Test Series", aLabel: "Choose exam…", bLabel: "Choose post…" }
      : { title: "Move to My Test", aLabel: "Choose My Test stream…", bLabel: "Choose subject…" };

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
          <select value={sel.a} onChange={(e) => pickA(e.target.value)} className="input">
            <option value="">{cfg.aLabel}</option>
            {a.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
          <select value={sel.b} onChange={(e) => setSel((s) => ({ ...s, b: e.target.value }))} className="input" disabled={!sel.a}>
            <option value="">{cfg.bLabel}</option>
            {b.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
        </div>

        {msg && <p className="mt-3 text-sm font-medium text-rose-600">{msg}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="btn-primary">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Moving…</> : "Move"}
          </button>
        </div>
      </div>
    </div>
  );
}
