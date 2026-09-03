import { Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowRight } from "lucide-react";

// Compact number so a big question bank stays tidy on the card (1234 -> "1.2k").
const fmtCount = (n) => {
  const v = Number(n || 0);
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(v);
};

// One cell in the at-a-glance stats grid.
function Stat({ icon: Ic, value, label }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-slate-50 px-1 py-2 dark:bg-slate-800/60">
      <Ic className="h-4 w-4 text-slate-400 dark:text-slate-500" />
      <span className="mt-1 text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{fmtCount(value)}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
    </div>
  );
}

// Shared, professional stream card used by every public stream listing so they
// stay consistent: a full-width gradient banner with the stream's icon centred
// (its "image"), then the name, description, a subjects/topics/quizzes/questions
// stats grid, and an Explore footer pinned to the bottom for equal-height cards.
// `stream` is a stream object from GET /api/streams (carries the counts).
export default function StreamCard({ stream: s, to, style, className = "", footerLabel = "Subject-wise quizzes" }) {
  const Icon = Icons[s.icon] || Icons.GraduationCap;
  return (
    <Link
      to={to}
      style={style}
      className={`card-hover group flex flex-col overflow-hidden p-0 ${className}`}
    >
      {/* Full-width banner — the stream's icon centred over its gradient */}
      <div className={`relative flex h-24 items-center justify-center bg-gradient-to-br ${s.color || "from-blue-500 to-indigo-600"}`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.28),transparent_60%)]" />
        <Icon className="relative h-11 w-11 text-white drop-shadow-md transition-transform duration-300 group-hover:scale-110" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-white">{s.name}</h3>
        {s.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{s.description}</p>}

        {/* At-a-glance size of the stream */}
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          <Stat icon={Icons.FolderOpen} value={s.subjects} label="Subjects" />
          <Stat icon={Icons.Layers} value={s.topics} label="Topics" />
          <Stat icon={Icons.ListChecks} value={s.quizzes} label="Quizzes" />
          <Stat icon={Icons.HelpCircle} value={s.questions} label="Questions" />
        </div>

        {/* Footer pinned to the bottom so every card lines up */}
        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <span className="truncate text-xs font-medium text-slate-400 dark:text-slate-500">{footerLabel}</span>
          <span className="flex flex-shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
            Explore <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
