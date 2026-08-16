import { useRef, useState } from "react";
import { DatabaseBackup, Download, Upload, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { adminBackupService } from "../../services";
import { useSettings } from "../../context/SettingsContext";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Turn an account/brand name into a safe filename prefix.
const safeName = (s) => String(s || "").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "backup";

// Full content-library backup & restore for the admin: Content
// (streams→subjects→topics→sessions→quizzes→questions), Study Material and
// Test Series. Both run as background jobs with a live % progress bar.
export default function AdminBackup() {
  const { settings } = useSettings();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(""); // "" | "backup" | "restore"
  const [progress, setProgress] = useState(null); // { done, total, phase }
  const [msg, setMsg] = useState(null); // { ok, text }

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const backup = async () => {
    setBusy("backup"); setMsg(null); setProgress({ done: 0, total: 0, phase: "Starting…" });
    try {
      const { jobId, total } = await adminBackupService.start();
      setProgress({ done: 0, total: total || 0, phase: "Starting…" });
      let st;
      for (;;) {
        await sleep(800);
        st = await adminBackupService.job(jobId);
        setProgress({ done: st.done || 0, total: st.total || total || 0, phase: st.phase || "" });
        if (st.status === "done") break;
        if (st.status === "error") throw new Error(st.error || "Backup failed.");
      }
      const data = await adminBackupService.file(jobId);
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName(settings?.siteName)}-content-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      const c = data?.counts || {};
      const totalQ = (c.contentQuestions || 0) + (c.testQuestions || 0) + (c.practiceQuestions || 0);
      setMsg({ ok: true, text: `Backed up ${c.quizzes || 0} quizzes, ${totalQ} questions, ${c.series || 0} test series, ${c.practiceItems || 0} My Practice items and ${c.smFiles || 0} study files. Save this file somewhere safe (e.g. Google Drive).` });
    } catch (e) {
      setMsg({ ok: false, text: e?.message || "Backup failed — please try again." });
    } finally {
      setBusy(""); setProgress(null);
    }
  };

  const onRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Restore MERGES this backup into your live content: it re-creates anything that's missing and reuses items that already exist (matched by name). It never deletes. Continue?")) return;
    setBusy("restore"); setMsg(null); setProgress({ done: 0, total: 0, phase: "Reading file…" });
    try {
      let parsed;
      try { parsed = JSON.parse(await file.text()); }
      catch { throw new Error("That file isn't a valid backup file."); }
      const { jobId, total } = await adminBackupService.startRestore(parsed);
      setProgress({ done: 0, total: total || 0, phase: "Starting…" });
      let st;
      for (;;) {
        await sleep(800);
        st = await adminBackupService.restoreJob(jobId);
        setProgress({ done: st.done || 0, total: st.total || total || 0, phase: st.phase || "" });
        if (st.status === "done") break;
        if (st.status === "error") throw new Error(st.error || "Restore failed.");
      }
      const r = st.result || {};
      const totalQ = (r.questions || 0) + (r.practiceQuestions || 0);
      setMsg({ ok: true, text: `Restore complete. Added ${r.quizzes || 0} quizzes, ${totalQ} questions, ${r.series || 0} test series, ${r.practiceItems || 0} My Practice items, ${r.smFiles || 0} study files (existing items were reused, not duplicated).` });
    } catch (err) {
      setMsg({ ok: false, text: err?.message || "Restore failed — please check the file and try again." });
    } finally {
      setBusy(""); setProgress(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          <DatabaseBackup className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold leading-none">Backup &amp; Restore</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Download your entire content library as one file, keep it safe (e.g. Google Drive), and restore it anytime.</p>
        </div>
      </div>

      <div className="card mt-5 p-5">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This backs up <b>everything</b>: quiz content (streams, subjects, topics, sessions, quizzes &amp; questions), study material, test series, and <b>My Practice</b> — all with their questions.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button onClick={backup} disabled={!!busy} className="btn-primary flex-1">
            {busy === "backup" ? <><Loader2 className="h-4 w-4 animate-spin" /> Backing up…</> : <><Download className="h-4 w-4" /> Back up everything</>}
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="btn-outline flex-1">
            {busy === "restore" ? <><Loader2 className="h-4 w-4 animate-spin" /> Restoring…</> : <><Upload className="h-4 w-4" /> Restore from a backup</>}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onRestoreFile} />
        </div>

        {progress && (
          <div className="mt-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {busy === "backup" ? "Backing up" : "Restoring"}: {progress.phase} — <b>{pct}%</b>{progress.total ? ` · ${progress.done} / ${progress.total}` : ""}
            </p>
          </div>
        )}

        {msg && (
          <div className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${msg.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300"}`}>
            {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <b>How restore works:</b> it <b>merges</b> — anything missing is re-created, and items that already exist (matched by name) are reused, so it never duplicates your structure or deletes anything. Study-material files are stored as links, so the original files must still exist online.
        </div>
      </div>
    </div>
  );
}
