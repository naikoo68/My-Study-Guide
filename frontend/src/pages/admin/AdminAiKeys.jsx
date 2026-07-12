import { useEffect, useState, useCallback } from "react";
import { KeyRound, Plus, Trash2, Pencil, X, CheckCircle2, XCircle, Loader2, RefreshCw, Power } from "lucide-react";
import { aiService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const PRESETS = [
  { label: "Google Gemini", baseUrl: GEMINI_BASE, models: "gemini-flash-latest" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: "gpt-4o-mini" },
  { label: "TokenLab", baseUrl: "https://api.tokenlab.sh/v1", models: "gpt-4o-mini" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: "llama-3.3-70b-versatile" },
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: "deepseek-chat" },
];

const blank = { label: "", baseUrl: GEMINI_BASE, models: "gemini-flash-latest", key: "" };

export default function AdminAiKeys() {
  const [keys, setKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { mode:"add"|"edit", data }
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({}); // id -> bool
  const [busy, setBusy] = useState({}); // id -> bool (toggle/delete)

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    aiService.keys
      .list()
      .then((res) => {
        // Backward/forward compatible: response is { keys, models } or a raw array.
        const list = Array.isArray(res) ? res : res?.keys || [];
        setKeys(list);
        setModels(Array.isArray(res) ? [] : res?.models || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const openAdd = () => { setForm(blank); setModal({ mode: "add" }); };
  const openEdit = (k) => {
    setForm({ label: k.label || "", baseUrl: k.baseUrl, models: k.models, key: "" }); // key blank = keep existing
    setModal({ mode: "edit", data: k });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.mode === "add") {
        if (!form.key.trim()) throw new Error("Paste the API key.");
        await aiService.keys.create(form);
      } else {
        await aiService.keys.update(modal.data._id, form); // blank key keeps the old one
      }
      setModal(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async (id) => {
    setTesting((t) => ({ ...t, [id]: true }));
    try {
      await aiService.keys.test(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setTesting((t) => ({ ...t, [id]: false }));
    }
  };

  const toggle = async (k) => {
    setBusy((b) => ({ ...b, [k._id]: true }));
    try {
      await aiService.keys.update(k._id, { enabled: !k.enabled });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, [k._id]: false }));
    }
  };

  const remove = async (k) => {
    if (!window.confirm(`Delete the key "${k.label || k.keyMask}"? This cannot be undone.`)) return;
    setBusy((b) => ({ ...b, [k._id]: true }));
    try {
      await aiService.keys.remove(k._id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, [k._id]: false }));
    }
  };

  const activeCount = keys.filter((k) => k.enabled).length;

  const StatusBadge = ({ k }) => {
    if (!k.enabled) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800">Disabled</span>;
    if (k.lastStatus === "ok") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>;
    if (k.lastStatus === "error") return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"><XCircle className="h-3.5 w-3.5" /> Not working</span>;
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Untested</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">AI API Keys</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Add the keys the AI Generator uses. Enabled keys with the same model act as quota fallbacks —
            <span className="font-semibold text-emerald-600 dark:text-emerald-400"> {activeCount} enabled</span>.
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> Add API Key</button>
      </div>

      {models.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-1.5 text-sm font-semibold">Models available in the generator ({models.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => (
              <span key={m} className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{m}</span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <Loading label="Loading keys..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : keys.length === 0 ? (
        <EmptyState message="No API keys yet. Click “Add API Key” to add your first one." />
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k._id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{k.label || "Untitled key"}</p>
                  <StatusBadge k={k} />
                  {k.source === "env" && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800">From server (Render)</span>
                  )}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800">{k.keyMask}</code>
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {k.models} · {k.baseUrl}
                  {k.lastStatus === "error" && k.lastError ? ` · ${k.lastError}` : ""}
                </p>
              </div>
              {k.readOnly ? (
                <span className="flex-shrink-0 text-xs text-slate-400">Managed in Render env vars</span>
              ) : (
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button onClick={() => test(k._id)} disabled={testing[k._id]} title="Test this key now" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-900/30">
                    {testing[k._id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </button>
                  <button onClick={() => toggle(k)} disabled={busy[k._id]} title={k.enabled ? "Disable" : "Enable"} className={`rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800 ${k.enabled ? "text-emerald-600" : "text-slate-400"}`}>
                    <Power className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(k)} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(k)} disabled={busy[k._id]} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-900/30">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={save} className="my-8 w-full max-w-lg animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="h-5 w-5 text-brand-600" /> {modal.mode === "add" ? "Add API Key" : "Edit API Key"}</h3>
              <button type="button" onClick={() => setModal(null)}><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold">Provider preset</label>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => setForm((f) => ({ ...f, baseUrl: p.baseUrl, models: p.models, label: f.label || p.label }))}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Label</label>
                <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Gemini account 1" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">API key {modal.mode === "edit" && <span className="font-normal text-slate-400">(leave blank to keep the current one)</span>}</label>
                <input className="input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder={modal.mode === "edit" ? "•••• (unchanged)" : "Paste the API key"} autoComplete="off" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Base URL</label>
                <input className="input" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={GEMINI_BASE} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Model(s)</label>
                <input className="input" value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} placeholder="gemini-flash-latest" />
                <p className="mt-1 text-xs text-slate-400">Comma-separate multiple models. Use the <b>same</b> model on several keys to make them quota fallbacks.</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModal(null)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : modal.mode === "add" ? "Add Key" : "Save Changes"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
