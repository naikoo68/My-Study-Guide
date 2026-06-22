const styles = {
  Easy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Hard: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  accent: "bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default function Badge({ children, variant = "neutral", className = "" }) {
  return (
    <span className={`badge ${styles[variant] || styles.neutral} ${className}`}>
      {children}
    </span>
  );
}
