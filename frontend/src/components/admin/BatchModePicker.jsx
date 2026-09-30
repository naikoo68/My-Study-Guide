// How many questions go in each AI request for the bulk Extend / Regenerate
// jobs. "max" (default) fills each request up to 12 and runs them on fresh
// keys at once; "spread" gives every key a small share.
import { BATCH_MODE_KEY } from "./batchMode";

export default function BatchModePicker({ value, onChange, disabled, total = 0, keys = 0 }) {
  const set = (v) => {
    onChange(v);
    try { localStorage.setItem(BATCH_MODE_KEY, v); } catch { /* storage blocked */ }
  };
  // Preview of what the run will do, using the same maths as the server.
  const k = Math.max(1, keys || 1);
  const spreadPer = total ? Math.max(1, Math.min(12, Math.ceil(total / k))) : 0;
  const hint = (per) => {
    if (!total) return "";
    const calls = Math.ceil(total / per);
    return ` · ${total} questions → ${per} per request, ${calls} request${calls === 1 ? "" : "s"}, ${Math.min(calls, k)} key${Math.min(calls, k) === 1 ? "" : "s"} working`;
  };
  const opt = (v, title, text) => (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${value === v ? "border-brand-500 bg-brand-50/60 dark:bg-brand-900/20" : "border-slate-200 dark:border-slate-700"}`}>
      <input type="radio" name="batch-mode" className="mt-0.5 h-4 w-4 accent-brand-600" checked={value === v} onChange={() => set(v)} disabled={disabled} />
      <span><b>{title}</b> — {text}</span>
    </label>
  );
  return (
    <div className="mt-3">
      <p className="mb-1 text-sm font-medium">Questions per request</p>
      <div className="grid gap-2">
        {opt("max", "Up to 12 per request", `fills each request with up to 12 questions (e.g. 26 → 12 + 12 + 2) and sends them to fresh keys at the same time; if a key is rate limited, its questions move to another fresh key${hint(12)}.`)}
        {opt("spread", "Spread over all keys", `gives every key a small share (up to 12 each)${hint(spreadPer)}.`)}
      </div>
    </div>
  );
}
