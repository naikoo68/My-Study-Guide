import * as Icons from "lucide-react";

export default function StatCard({ icon, label, value, sub, accent = "brand" }) {
  const Icon = Icons[icon] || Icons.Activity;
  const tones = {
    brand: "bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300",
    accent: "bg-accent-100 text-accent-600 dark:bg-accent-900/40 dark:text-accent-300",
    green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300",
    violet: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300",
  };
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {sub}
            </p>
          )}
        </div>
        <div className={`rounded-xl p-3 ${tones[accent]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
