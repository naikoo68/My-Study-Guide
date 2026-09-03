import { Loader2 } from "lucide-react";

// A labeled, tap-friendly action button for the admin content/practice manager
// rows. Shows an ICON + NAME (instead of a tiny icon-only button) so every
// action is clear and easy to hit on touch screens. Colour is chosen via `tone`.
const TONES = {
  brand: "text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30",
  sky: "text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-900/30",
  indigo: "text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-900/30",
  emerald: "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30",
  violet: "text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-900/30",
  amber: "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/30",
  rose: "text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/30",
  slate: "text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
};

export default function RowActionButton({ icon: Icon, label, onClick, title, tone = "brand", disabled = false, loading = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title || label}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200/70 px-3 py-2 text-xs font-semibold transition disabled:opacity-50 dark:border-slate-700/70 ${TONES[tone] || TONES.brand}`}
    >
      {loading ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" /> : <Icon className="h-4 w-4 flex-shrink-0" />}
      <span>{label}</span>
    </button>
  );
}
