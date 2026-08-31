import { useEffect, useState, useCallback } from "react";
import { Trash2, RefreshCw, RotateCcw, AlertTriangle, Loader2, Inbox } from "lucide-react";
import { recycleService } from "../../services";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

// Unified admin Recycle Bin — lists everything that was soft-deleted anywhere
// in the admin panel (content tree + notices, messages, reviews, coupons,
// documents, feedback, …), and lets you Restore or permanently delete each.
export default function AdminRecycleBin() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState(() => new Set()); // `${type}:${id}` ticked
  const [bulkBusy, setBulkBusy] = useState(null); // { done, total } while restoring many

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    recycleService
      .list()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (it) => {
    setBusyId(it._id); setMsg("");
    try {
      await recycleService.restore(it.type, it._id);
      setMsg(`Restored: ${it.title}`);
      load();
    } catch (e) { setMsg(e.message || "Restore failed."); }
    finally { setBusyId(""); }
  };

  const purge = async (it) => {
    if (!window.confirm(`Permanently delete this ${it.label.toLowerCase()}? This CANNOT be undone.`)) return;
    setBusyId(it._id); setMsg("");
    try {
      await recycleService.remove(it.type, it._id);
      setMsg(`Permanently deleted: ${it.title}`);
      load();
    } catch (e) { setMsg(e.message || "Delete failed."); }
    finally { setBusyId(""); }
  };

  const emptyBin = async () => {
    if (!window.confirm("Permanently empty the ENTIRE Recycle Bin? Everything here will be gone for good and cannot be recovered.")) return;
    setBusyId("__all__"); setMsg("");
    try {
      await recycleService.empty();
      setMsg("Recycle Bin emptied.");
      load();
    } catch (e) { setMsg(e.message || "Empty failed."); }
    finally { setBusyId(""); }
  };

  const keyOf = (it) => `${it.type}:${it._id}`;
  const items = data?.items || [];
  const allSelected = items.length > 0 && items.every((it) => selected.has(keyOf(it)));
  const toggle = (it) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(it);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(items.map(keyOf))));

  // Restore several items in sequence (no bulk API — loop the single restore).
  // Restoring a parent brings its subtree back, so a child restore after is a
  // harmless no-op.
  const restoreMany = async (list) => {
    if (!list.length || bulkBusy) return;
    setMsg("");
    setBulkBusy({ done: 0, total: list.length, mode: "restore" });
    let failed = 0;
    for (const it of list) {
      try { await recycleService.restore(it.type, it._id); } catch { failed++; }
      setBulkBusy((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setBulkBusy(null);
    setSelected(new Set());
    setMsg(failed ? `Restored ${list.length - failed} of ${list.length}; ${failed} failed.` : `Restored ${list.length} item${list.length === 1 ? "" : "s"}.`);
    load();
  };
  const restoreSelected = () => restoreMany(items.filter((it) => selected.has(keyOf(it))));
  const restoreAll = () => restoreMany(items.slice());

  // Permanently delete the ticked items (cascade removal — cannot be undone).
  const removeSelected = async () => {
    const list = items.filter((it) => selected.has(keyOf(it)));
    if (!list.length || bulkBusy) return;
    if (!window.confirm(`Permanently delete ${list.length} selected item${list.length === 1 ? "" : "s"}? This also removes everything inside them and CANNOT be undone.`)) return;
    setMsg("");
    setBulkBusy({ done: 0, total: list.length, mode: "delete" });
    let failed = 0;
    for (const it of list) {
      try { await recycleService.remove(it.type, it._id); } catch { failed++; }
      setBulkBusy((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setBulkBusy(null);
    setSelected(new Set());
    setMsg(failed ? `Deleted ${list.length - failed} of ${list.length}; ${failed} failed.` : `Permanently deleted ${list.length} item${list.length === 1 ? "" : "s"}.`);
    load();
  };

  const fmtWhen = (d) => {
    if (!d) return "";
    const diff = Date.now() - new Date(d).getTime();
    const day = 86400000;
    if (diff < day) return "today";
    const days = Math.floor(diff / day);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Trash2 className="h-6 w-6 text-brand-600" /> Recycle Bin
          </h1>
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">Deleted items are kept here so you can restore them. Nothing is gone until you permanently delete it.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          {selected.size > 0 && (
            <button onClick={restoreSelected} disabled={!!bulkBusy} className="btn-outline text-emerald-600 disabled:opacity-50">
              {bulkBusy?.mode === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restore selected ({selected.size})
            </button>
          )}
          {selected.size > 0 && (
            <button onClick={removeSelected} disabled={!!bulkBusy} className="btn-outline border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:hover:bg-rose-900/10">
              {bulkBusy?.mode === "delete" ? (<><Loader2 className="h-4 w-4 animate-spin" /> Deleting {bulkBusy.done}/{bulkBusy.total}</>) : (<><Trash2 className="h-4 w-4" /> Delete selected ({selected.size})</>)}
            </button>
          )}
          {data?.total > 0 && (
            <button onClick={restoreAll} disabled={!!bulkBusy} className="btn-outline text-emerald-600 disabled:opacity-50">
              {bulkBusy?.mode === "restore" ? (<><Loader2 className="h-4 w-4 animate-spin" /> Restoring {bulkBusy.done}/{bulkBusy.total}</>) : (<><RotateCcw className="h-4 w-4" /> Restore all</>)}
            </button>
          )}
          {data?.total > 0 && (
            <button onClick={emptyBin} disabled={busyId === "__all__"} className="btn-primary bg-rose-600 hover:bg-rose-700 disabled:opacity-50">
              {busyId === "__all__" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Empty bin
            </button>
          )}
        </div>
      </div>

      {msg && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{msg}</p>}

      {loading ? (
        <Loading label="Loading Recycle Bin…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.total === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-14 text-center">
          <Inbox className="h-12 w-12 text-slate-300 dark:text-slate-600" />
          <p className="text-lg font-semibold">The Recycle Bin is empty</p>
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">Anything you delete across the admin panel will appear here, ready to restore.</p>
        </div>
      ) : (
        <>
          {/* Warning banner */}
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> "Restore" brings an item back to where it was. "Delete permanently" removes it for good and cannot be undone.
          </p>

          <label className="flex w-fit cursor-pointer items-center gap-2 px-1 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={allSelected} onChange={toggleAll} />
            Select all ({items.length})
          </label>

          <div className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
            {data.items.map((it) => (
              <div key={`${it.type}-${it._id}`} className="flex flex-wrap items-center gap-3 p-4">
                <input type="checkbox" className="h-4 w-4 flex-shrink-0 rounded border-slate-300" checked={selected.has(`${it.type}:${it._id}`)} onChange={() => toggle(it)} />
                <span className="inline-flex flex-shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {it.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">{it.title}</p>
                  <p className="text-xs text-slate-400">Deleted {fmtWhen(it.deletedAt)}</p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button onClick={() => restore(it)} disabled={busyId === it._id} className="btn-outline py-1.5 text-sm disabled:opacity-50">
                    {busyId === it._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restore
                  </button>
                  <button onClick={() => purge(it)} disabled={busyId === it._id} className="btn-outline border-rose-200 py-1.5 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:hover:bg-rose-900/10">
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
