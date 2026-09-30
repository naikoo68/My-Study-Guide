// How many questions go in each AI request for the bulk Extend / Regenerate
// jobs. "spread" works exactly like question generation (all keys get work,
// up to 12 per request); "max" always packs 12 per request.
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
        {opt("spread", "Like question generation (all keys)", `spreads the questions over every key, up to 12 per request. Fastest for most quizzes${hint(spreadPer)}.`)}
        {opt("max", "12 per request", `always packs 12 questions into each request, so fewer keys are needed on a small quiz${hint(12)}.`)}
      </div>
    </div>
  );
}
