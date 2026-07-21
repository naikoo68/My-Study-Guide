import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Megaphone, Eye, EyeOff, BellRing, Facebook, Send, Loader2, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import { noticeService, settingsService } from "../../services";
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

  // Facebook Page auto-posting config (token is write-only — never read back).
  const [fb, setFb] = useState({ fbEnabled: false, fbPageId: "", fbAutoOnNotice: false, fbGraphVersion: "v21.0" });
  const [fbToken, setFbToken] = useState(""); // typed only when changing the saved token
  const [fbSaving, setFbSaving] = useState(false);
  const [fbTesting, setFbTesting] = useState(false);
  const [fbMsg, setFbMsg] = useState(null); // { ok, text }

  const load = () => {
    setLoading(true);
    setError("");
    noticeService.listAll().then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { setNotify(settings?.notifyOnNewContent === true); }, [settings?.notifyOnNewContent]);
  useEffect(() => {
    setFb({
      fbEnabled: settings?.fbEnabled === true,
      fbPageId: settings?.fbPageId || "",
      fbAutoOnNotice: settings?.fbAutoOnNotice === true,
      fbGraphVersion: settings?.fbGraphVersion || "v21.0",
    });
  }, [settings?.fbEnabled, settings?.fbPageId, settings?.fbAutoOnNotice, settings?.fbGraphVersion]);

  const saveFb = async () => {
    setFbSaving(true);
    setFbMsg(null);
    try {
      await saveSettings({ ...fb, ...(fbToken.trim() ? { fbPageAccessToken: fbToken.trim() } : {}) });
      setFbToken("");
      setFbMsg({ ok: true, text: "Saved." });
    } catch (e2) {
      setFbMsg({ ok: false, text: e2.message });
    } finally {
      setFbSaving(false);
    }
  };

  const testFb = async () => {
    setFbTesting(true);
    setFbMsg(null);
    try {
      const r = await settingsService.testFacebook({});
      setFbMsg({ ok: true, text: `Posted to Facebook${r?.id ? ` (post id ${r.id})` : ""}. Check your Page.` });
    } catch (e2) {
      setFbMsg({ ok: false, text: e2.message || "Could not post. Check your Page ID and token." });
    } finally {
      setFbTesting(false);
    }
  };

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

      {/* Auto-notify toggle */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
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

      {/* Facebook Page auto-posting */}
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10 text-[#1877F2]"><Facebook className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Auto-post to your Facebook Page</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Connect a Facebook Page and every new notice you add is posted to it automatically. Your access token is stored on the server and never shown in the browser.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/* Master enable */}
              <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <span className="text-sm font-medium">Enable Facebook posting</span>
                <button type="button" onClick={() => setFb((f) => ({ ...f, fbEnabled: !f.fbEnabled }))}
                  className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${fb.fbEnabled ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`} aria-pressed={fb.fbEnabled}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${fb.fbEnabled ? "left-6" : "left-1"}`} />
                </button>
              </label>
              {/* Auto on notice */}
              <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <span className="text-sm font-medium">Auto-post every new notice</span>
                <button type="button" onClick={() => setFb((f) => ({ ...f, fbAutoOnNotice: !f.fbAutoOnNotice }))}
                  className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${fb.fbAutoOnNotice ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} aria-pressed={fb.fbAutoOnNotice}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${fb.fbAutoOnNotice ? "left-6" : "left-1"}`} />
                </button>
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Facebook Page ID</label>
                <input className="input" value={fb.fbPageId} onChange={(e) => setFb((f) => ({ ...f, fbPageId: e.target.value }))} placeholder="e.g. 100091234567890" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Graph API version</label>
                <input className="input" value={fb.fbGraphVersion} onChange={(e) => setFb((f) => ({ ...f, fbGraphVersion: e.target.value }))} placeholder="v21.0" />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><KeyRound className="h-4 w-4 text-slate-400" /> Page Access Token</label>
              <input
                type="password"
                className="input"
                value={fbToken}
                onChange={(e) => setFbToken(e.target.value)}
                placeholder={settings?.fbTokenSet ? "•••••••••• (saved — type to replace)" : "Paste your long-lived Page access token"}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-slate-400">
                {settings?.fbTokenSet ? "A token is saved. Leave this blank to keep it, or paste a new one to replace it." : "Required to post. Use a long-lived Page access token."}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={saveFb} disabled={fbSaving} className="btn-primary">
                {fbSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save Facebook settings"}
              </button>
              <button type="button" onClick={testFb} disabled={fbTesting || !settings?.fbTokenSet} title={!settings?.fbTokenSet ? "Save a token first" : "Publish a test post to your Page"} className="btn-outline">
                {fbTesting ? <><Loader2 className="h-4 w-4 animate-spin" /> Posting…</> : <><Send className="h-4 w-4" /> Send test post</>}
              </button>
              {fbMsg && (
                <span className={`inline-flex items-center gap-1 text-sm font-medium ${fbMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>
                  {fbMsg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {fbMsg.text}
                </span>
              )}
            </div>
          </div>
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
          {items.map((n) => (
            <div key={n._id} className="card flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${n.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                    {n.active ? "Active" : "Hidden"}
                  </span>
                  <span className="text-xs text-slate-400">Order: {n.order || 0}</span>
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
          ))}
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
