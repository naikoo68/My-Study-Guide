export default function ProgressBar({ value = 0, className = "", color }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor =
    color ||
    (pct >= 100
      ? "bg-emerald-500"
      : pct >= 50
      ? "bg-brand-600"
      : "bg-accent-500");
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
