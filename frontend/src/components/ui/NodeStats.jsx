// Compact "N topics · M quizzes · K questions" chip row for a browse node card.
// Pass `items` as [{ icon, value, label }]. Values that are missing or 0 are
// hidden, so a card only advertises what it actually contains. Renders nothing
// when there's nothing to show.
export default function NodeStats({ items, className = "" }) {
  const shown = (items || []).filter((s) => typeof s.value === "number" && s.value > 0);
  if (!shown.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400 ${className}`}>
      {shown.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1" title={`${s.value} ${s.label}`}>
          <s.icon className="h-3.5 w-3.5" /> {s.value}
        </span>
      ))}
    </div>
  );
}
