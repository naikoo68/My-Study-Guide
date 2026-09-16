import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Megaphone, Eye, EyeOff, BellRing, CalendarClock } from "lucide-react";
import { noticeService } from "../../services";
import { useSettings } from "../../context/SettingsContext";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

const blank = { text: "", link: "", active: true, order: 0 };

export default function AdminNotices() {
  const { settings, save: saveSettings } = useSettings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { mode: "add"|"edit", data }
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(false);
  const [notifySaving, setNotifySaving] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30); // auto-expire content notices after N days (0 = never)
  const [expirySaving, setExpirySaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    noticeService.listAll().then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);
  // Sync the content-notify controls from saved settings when they load.
  useEffect(() => {
    setNotify(settings?.notifyOnNewContent === true);
    if (settings?.notifyExpiryDays != null) setExpiryDays(settings.notifyExpiryDays);
  }, [settings?.notifyOnNewContent, settings?.notifyExpiryDays]);

  const toggleNotify = async () => {
    const next = !notify;
    setNotify(next);
    setNotifySaving(true);
    try {
      await saveSettings({ notifyOnNewContent: next });
    } catch (e2) {
      setError(e2.message);
      setNotify(!next);
    } finally {
      setNotifySaving(false);
    }
  };

  // Save the auto-expiry window (days) for CONTENT notices only. New content
  // notices posted after this get an expiry that many days out; 0 = never.
  const saveExpiry = async () => {
    const days = Math.max(0, Math.min(365, parseInt(expiryDays, 10) || 0));
    setExpiryDays(days);
    setExpirySaving(true);
    try {
      await saveSettings({ notifyExpiryDays: days });
    } catch (e2) {
      setError(e2.message);
    } finally {
      setExpirySaving(false);
    }
  };

  // Bulk-remove ALL auto content notices (manual announcements are untouched).
  const clearContent = async () => {
    const count = items.filter((n) => n.auto).length;
    if (!count) { window.alert("There are no content notices to clear."); return; }
    if (!window.confirm(`Clear all ${count} auto content notice(s)? Your manual notices are kept, and cleared ones go to the Recycle Bin.`)) return;
    setClearing(true);
    try {
      await noticeService.clearContent();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setClearing(false);
    }
  };

  const openAdd = () => {
    setForm(blank);
    setModal({ mode: "add" });
  };
  const openEdit = (n) => {
    setForm({ text: n.text, link: n.link || "", active: n.active, order: n.order || 0 });
    setModal({ mode: "edit", data: n });
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.text.trim()) return;
    setSaving(true);
    try {
      if (modal.mode === "edit") await noticeService.update(modal.data._id, form);
      else await noticeService.create(form);
      setModal(null);
      load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (n) => {
    try {
      const updated = await noticeService.update(n._id, { active: !n.active });
      setItems((l) => l.map((x) => (x._id === n._id ? updated : x)));
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (n) => {
    if (!window.confirm("Delete this notice?")) return;
    try {
      await noticeService.remove(n._id);
      setItems((l) => l.filter((x) => x._id !== n._id));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <Megaphone className="h-6 w-6 text-accent-500" /> Notice Board
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Add, edit and delete the announcements that scroll across the top of the site.</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="h-4 w-4" /> Add Notice
        </button>
      </div>

      {/* Content notifications — their own section, separate from manual notices.
          Auto "New … added" notices are toggled, auto-expired and bulk-cleared
          here; the "Add Notice" button above still handles manual announcements. */}
      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-500" />
            <div>
              <p className="font-semibold">Notify students about new content</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">When on, adding a new quiz or test series automatically posts a notice here and emails every registered student.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleNotify}
            disabled={notifySaving}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition ${notify ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
            aria-pressed={notify}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${notify ? "left-6" : "left-1"}`} />
          </button>
        </div>

        {/* Auto-expiry + bulk clear — apply to content notices ONLY, never manual */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-500" />
            <div>
              <p className="font-semibold">Auto-expire content notices</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Auto “New … added” notices stop showing to students this many days after they’re posted, so the board self-cleans. Set <b>0</b> to never expire. Your manual notices are never affected.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className="input w-24"
                  aria-label="Days until content notices expire"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">days</span>
                <button type="button" onClick={saveExpiry} disabled={expirySaving} className="btn-outline">
                  {expirySaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
          <button type="button" onClick={clearContent} disabled={clearing} className="btn-outline !text-rose-600 dark:!text-rose-400">
            <Trash2 className="h-4 w-4" /> {clearing ? "Clearing…" : "Clear content notices"}
          </button>
        </div>
      </div>

      {loading ? (
        <Loading label="Loading notices..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState message="No notices yet. Add one to show it in the scrolling ticker." />
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const expired = n.auto && n.expiresAt && new Date(n.expiresAt) < new Date();
            return (
            <div key={n._id} className="card flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${n.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                    {n.active ? "Active" : "Hidden"}
                  </span>
                  <span className={`badge ${n.auto ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"}`}>
                    {n.auto ? "Content" : "Manual"}
                  </span>
                  <span className="text-xs text-slate-400">Order: {n.order || 0}</span>
                  {n.auto && n.expiresAt && (
                    <span className={`text-xs font-medium ${expired ? "text-rose-500" : "text-slate-400"}`}>
                      {expired
                        ? "Expired — hidden from students"
                        : `Expires ${new Date(n.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-medium">{n.text}</p>
                {n.link && <a href={n.link} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline dark:text-brand-400">{n.link}</a>}
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <button onClick={() => toggleActive(n)} title={n.active ? "Hide" : "Show"} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                  {n.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button onClick={() => openEdit(n)} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(n)} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setModal(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="my-8 w-full max-w-lg animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{modal.mode === "edit" ? "Edit" : "Add"} Notice</h3>
              <button type="button" onClick={() => setModal(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Notice text</label>
                <textarea required rows={2} className="input resize-none" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="e.g. New JKSSB test series is now live!" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Link (optional)</label>
                <input className="input" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Order</label>
                  <input type="number" className="input" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
                  <p className="mt-1 text-xs text-slate-400">Lower shows first.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Status</label>
                  <select className="input" value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                    <option value="1">Active (visible)</option>
                    <option value="0">Hidden</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModal(null)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
