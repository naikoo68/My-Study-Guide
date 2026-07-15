import { useEffect, useState, useCallback } from "react";
import { KeyRound, Plus, Trash2, Pencil, X, CheckCircle2, XCircle, Loader2, RefreshCw, Power, Download, List, Layers } from "lucide-react";
import { aiService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const PRESETS = [
  { label: "Google Gemini", baseUrl: GEMINI_BASE, models: "gemini-2.5-flash" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: "gpt-4o-mini" },
  { label: "TokenLab", baseUrl: "https://api.tokenlab.sh/v1", models: "gpt-4o-mini" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: "llama-3.3-70b-versatile" },
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: "deepseek-chat" },
  // OpenRouter — one key, hundreds of models (incl. free ":free" ones and Claude/Gemini/GPT).
  // After adding the key, use the "Show models" button to pick a valid model id.
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: "deepseek/deepseek-chat" },
  // Kiro has no official public API — it works via a self-hosted "Kiro gateway"
  // (OpenAI-compatible). Replace the Base URL with YOUR gateway's public address.
  { label: "Kiro", baseUrl: "https://your-kiro-gateway/v1", models: "claude-sonnet-4" },
];

const blank = { label: "", baseUrl: GEMINI_BASE, models: "gemini-2.5-flash", key: "", creditLimit: "" };
// Bulk-add defaults: one shared preset applied to every pasted key.
const blankBulk = { label: "", baseUrl: GEMINI_BASE, models: "gemini-2.5-flash", creditLimit: "", keysText: "" };

// Compact number formatter (1234567 -> "1.23M", 12345 -> "12.3K").
const fmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.?0+$/, "") + "K";
  return String(v);
};

// `clientMode` renders the same manager for a self-service client: the backend
// scopes every call to the client's OWN keys, so add / bulk-add / test / test-all
// / refresh / delete all work unchanged. Only the heading copy differs, and
// server/env-key features never appear (the API doesn't return them to clients).
export default function AdminAiKeys({ clientMode = false }) {
  const [keys, setKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { mode:"add"|"edit", data }
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState(blankBulk);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null); // { created, skipped } after a bulk add
  const [testing, setTesting] = useState({}); // id -> bool
  const [busy, setBusy] = useState({}); // id -> bool (toggle/delete)
  const [bulkBusy, setBulkBusy] = useState(""); // "" | "test" | "import"
  const [keyModels, setKeyModels] = useState({}); // id -> available model ids
  const [modelsBusy, setModelsBusy] = useState({}); // id -> bool
  const [modelSearch, setModelSearch] = useState({}); // id -> filter text

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
        setTotals(Array.isArray(res) ? null : res?.totals || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const openAdd = () => { setForm(blank); setModal({ mode: "add" }); };
  const openEdit = (k) => {
    setForm({ label: k.label || "", baseUrl: k.baseUrl, models: k.models, key: "", creditLimit: k.creditLimit || "" }); // key blank = keep existing
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

  const openBulk = () => { setBulkForm(blankBulk); setBulkResult(null); setBulkModal(true); };

  // Split the textarea into individual keys (one per line; commas/spaces also
  // work). API keys never contain spaces, so this is safe.
  const parseBulkKeys = (text) => {
    const seen = new Set();
    return String(text || "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s && !seen.has(s) && seen.add(s));
  };

  const saveBulk = async (e) => {
    e.preventDefault();
    const list = parseBulkKeys(bulkForm.keysText);
    if (!list.length) { setError("Paste at least one API key (one per line)."); return; }
    setBulkSaving(true);
    setError("");
    try {
      const res = await aiService.keys.bulkCreate({
        keys: list,
        baseUrl: bulkForm.baseUrl,
        models: bulkForm.models,
        creditLimit: bulkForm.creditLimit,
        label: bulkForm.label,
      });
      setBulkResult({ created: res?.created || 0, skipped: res?.skipped || 0 });
      setBulkForm((f) => ({ ...f, keysText: "" })); // clear pasted keys, keep the preset
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkSaving(false);
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

  // Ask the provider which models THIS key can use, and show them as chips.
  const showModels = async (k) => {
    setModelsBusy((b) => ({ ...b, [k._id]: true }));
    setError("");
    try {
      const res = await aiService.keys.models(k._id);
      setKeyModels((s) => ({ ...s, [k._id]: res.models || [] }));
    } catch (e) {
      setError(`Couldn't list models: ${e.message}`);
    } finally {
      setModelsBusy((b) => ({ ...b, [k._id]: false }));
    }
  };
  // Set a key's model to the chosen id, then refresh.
  const pickModel = async (k, m) => {
    try {
      await aiService.keys.update(k._id, { models: m });
      setKeyModels((s) => { const c = { ...s }; delete c[k._id]; return c; });
      load();
    } catch (e) {
      setError(e.message);
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

  const importOne = async (k) => {
    // Import a single Render env key into the DB so it becomes manageable.
    setBusy((b) => ({ ...b, [k._id]: true }));
    try {
      await aiService.keys.importEnv();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, [k._id]: false }));
    }
  };

  const importAll = async () => {
    setBulkBusy("import");
    try {
      const res = await aiService.keys.importEnv();
      load();
      if (!res?.imported) setError("No new server keys to import (they may already be in the panel).");
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkBusy("");
    }
  };

  const testAll = async () => {
    setBulkBusy("test");
    try {
      await aiService.keys.testAll();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkBusy("");
    }
  };

  const hasEnvKeys = keys.some((k) => k.source === "env");
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
          <h1 className="text-2xl font-extrabold">{clientMode ? "My API Keys" : "AI API Keys"}</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {clientMode
              ? "Add your own AI provider keys. Several keys on the same model act as quota fallbacks —"
              : "Add the keys the AI Generator uses. Enabled keys with the same model act as quota fallbacks —"}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400"> {activeCount} enabled</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={loading} className="btn-outline" title="Refresh usage & totals">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          {keys.length > 0 && (
            <button onClick={testAll} disabled={bulkBusy === "test"} className="btn-outline">
              {bulkBusy === "test" ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing…</> : <><RefreshCw className="h-4 w-4" /> Test all</>}
            </button>
          )}
          {hasEnvKeys && (
            <button onClick={importAll} disabled={bulkBusy === "import"} className="btn-outline">
              {bulkBusy === "import" ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <><Download className="h-4 w-4" /> Import server keys</>}
            </button>
          )}
          <button onClick={openBulk} className="btn-outline"><Layers className="h-4 w-4" /> Bulk add</button>
          <button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> Add API Key</button>
        </div>
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

      {totals && (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Requests used</p>
              <p className="text-xl font-extrabold">{fmt(totals.totalRequests)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tokens used</p>
              <p className="text-xl font-extrabold">{fmt(totals.totalTokens)}</p>
            </div>
            <div className={`rounded-xl border p-3 ${totals.hasLimits ? "border-slate-200 dark:border-slate-700" : "border-dashed border-slate-200 opacity-60 dark:border-slate-700"}`}>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total credits</p>
              <p className="text-xl font-extrabold">{totals.hasLimits ? fmt(totals.totalCredits) : "—"}</p>
            </div>
            <div className={`rounded-xl border p-3 ${totals.hasLimits ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/10" : "border-dashed border-slate-200 opacity-60 dark:border-slate-700"}`}>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Remaining</p>
              <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{totals.hasLimits ? fmt(totals.totalRemaining) : "—"}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Usage is counted by this site (real). Providers like Gemini/OpenAI don't expose your remaining balance via API —
            set a <b>credit limit</b> (token budget) on a key to see “credits” and “remaining”. Credits &amp; remaining count only keys that have a limit set.
          </p>
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
                {k.source !== "env" && (
                  <p className="mt-1 text-xs text-slate-400">
                    <span className="font-semibold text-slate-500 dark:text-slate-300">{fmt(k.usedRequests)}</span> requests ·{" "}
                    <span className="font-semibold text-slate-500 dark:text-slate-300">{fmt(k.usedTokens)}</span> tokens used
                    {k.creditLimit > 0 && (
                      <> · limit <span className="font-semibold text-slate-500 dark:text-slate-300">{fmt(k.creditLimit)}</span> · <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(Math.max(0, k.creditLimit - k.usedTokens))} left</span></>
                    )}
                  </p>
                )}
              </div>
              {k.readOnly ? (
                <button onClick={() => importOne(k)} disabled={busy[k._id]} className="btn-outline flex-shrink-0 py-1.5 text-xs">
                  {busy[k._id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Import to manage
                </button>
              ) : (
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button onClick={() => showModels(k)} disabled={modelsBusy[k._id]} title="Show models this key can use" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
                    {modelsBusy[k._id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <List className="h-4 w-4" />}
                  </button>
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

              {keyModels[k._id] && (
                <div className="w-full border-t border-slate-100 pt-2 dark:border-slate-800">
                  <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Models this key can use — click one to set it:
                  </p>
                  {keyModels[k._id].length === 0 ? (
                    <p className="text-xs text-slate-400">No models returned — the key may be invalid or out of quota.</p>
                  ) : (() => {
                    const q = (modelSearch[k._id] || "").toLowerCase().trim();
                    const filtered = keyModels[k._id].filter((m) => m.toLowerCase().includes(q));
                    return (
                      <>
                        <input
                          value={modelSearch[k._id] || ""}
                          onChange={(e) => setModelSearch((s) => ({ ...s, [k._id]: e.target.value }))}
                          placeholder={`Search ${keyModels[k._id].length} models…  (e.g. "flash", ":free", "claude")`}
                          className="input mb-2 py-1 text-xs"
                        />
                        {filtered.length === 0 ? (
                          <p className="text-xs text-slate-400">No models match “{modelSearch[k._id]}”.</p>
                        ) : (
                          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                            {filtered.map((m) => (
                              <button
                                key={m}
                                onClick={() => pickModel(k, m)}
                                title="Use this model for this key"
                                className={`rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                                  k.models === m
                                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                                    : "border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
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
                <input className="input" value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} placeholder="gemini-2.5-flash" />
                <p className="mt-1 text-xs text-slate-400">Comma-separate multiple models. Use the <b>same</b> model on several keys to make them quota fallbacks.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Credit limit <span className="font-normal text-slate-400">(tokens, optional)</span></label>
                <input type="number" min="0" className="input" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="e.g. 1000000" />
                <p className="mt-1 text-xs text-slate-400">Your total token budget for this key. Leave blank/0 if unknown — providers don't share it, so this is a manual figure used to show “remaining”.</p>
              </div>

              {modal.mode === "edit" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.resetUsage} onChange={(e) => setForm({ ...form, resetUsage: e.target.checked })} />
                  Reset this key's usage counters to zero
                </label>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModal(null)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : modal.mode === "add" ? "Add Key" : "Save Changes"}</button>
            </div>
          </form>
        </div>
      )}

      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={saveBulk} className="my-8 w-full max-w-lg animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><Layers className="h-5 w-5 text-brand-600" /> Bulk add API keys</h3>
              <button type="button" onClick={() => setBulkModal(null)}><X className="h-5 w-5" /></button>
            </div>

            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Paste several keys of the <b>same provider</b> — one per line. They'll all share the
              preset below. Adding several keys on the same model turns them into quota fallbacks.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold">Provider preset</label>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => setBulkForm((f) => ({ ...f, baseUrl: p.baseUrl, models: p.models, label: f.label || p.label }))}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Label prefix <span className="font-normal text-slate-400">(optional)</span></label>
                <input className="input" value={bulkForm.label} onChange={(e) => setBulkForm({ ...bulkForm, label: e.target.value })} placeholder="e.g. Gemini — keys are numbered “Gemini 1”, “Gemini 2”…" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Base URL</label>
                <input className="input" value={bulkForm.baseUrl} onChange={(e) => setBulkForm({ ...bulkForm, baseUrl: e.target.value })} placeholder={GEMINI_BASE} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Model(s)</label>
                <input className="input" value={bulkForm.models} onChange={(e) => setBulkForm({ ...bulkForm, models: e.target.value })} placeholder="gemini-2.5-flash" />
                <p className="mt-1 text-xs text-slate-400">Comma-separate multiple models. Applied to every key in the paste.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Credit limit <span className="font-normal text-slate-400">(tokens, optional)</span></label>
                <input type="number" min="0" className="input" value={bulkForm.creditLimit} onChange={(e) => setBulkForm({ ...bulkForm, creditLimit: e.target.value })} placeholder="e.g. 1000000" />
                <p className="mt-1 text-xs text-slate-400">Same budget applied to each key. Leave blank/0 if unknown.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">API keys <span className="font-normal text-slate-400">(one per line)</span></label>
                <textarea
                  className="input min-h-[140px] font-mono text-xs"
                  value={bulkForm.keysText}
                  onChange={(e) => setBulkForm({ ...bulkForm, keysText: e.target.value })}
                  placeholder={"AIzaSy...key1\nAIzaSy...key2\nAIzaSy...key3"}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-slate-400">
                  {parseBulkKeys(bulkForm.keysText).length} key(s) detected. Duplicates and keys already added are skipped automatically.
                </p>
              </div>

              {bulkResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                  Added <b>{bulkResult.created}</b> key(s){bulkResult.skipped ? <>, skipped <b>{bulkResult.skipped}</b> duplicate(s)</> : null}.
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setBulkModal(null)} className="btn-outline">Close</button>
              <button type="submit" disabled={bulkSaving || parseBulkKeys(bulkForm.keysText).length === 0} className="btn-primary">
                {bulkSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : <>Add {parseBulkKeys(bulkForm.keysText).length || ""} key(s)</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
