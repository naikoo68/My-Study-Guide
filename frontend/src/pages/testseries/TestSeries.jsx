import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  FileText,
  Award,
  Play,
  Lock,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { testSeries, testCategories } from "../../data/tests";
import Badge from "../../components/ui/Badge";

export default function TestSeries() {
  const { user } = useAuth();
  const [active, setActive] = useState("All");

  const filtered =
    active === "All"
      ? testSeries
      : testSeries.filter((t) => t.category === active);

  return (
    <div className="container-page py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Test Series</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Full-length mocks, subject & chapter tests, and previous-year papers.
        </p>
      </div>

      {!user && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <Lock className="h-5 w-5 flex-shrink-0" />
          <span>
            You need to{" "}
            <Link to="/login" className="font-semibold underline">log in</Link>{" "}
            to start a test. Browsing is open to everyone.
          </span>
        </div>
      )}

      {/* Category tabs */}
      <div className="mt-8 flex flex-wrap gap-2">
        {testCategories.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              active === c
                ? "bg-brand-600 text-white shadow-soft"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Test cards */}
      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t, i) => (
          <div
            key={t.id}
            style={{ animationDelay: `${i * 40}ms` }}
            className="card-hover flex animate-fade-in-up flex-col p-6 opacity-0"
          >
            <div className="flex items-start justify-between">
              <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                <Layers className="h-3.5 w-3.5" /> {t.category}
              </span>
              {t.enrolled && (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Enrolled
                </span>
              )}
            </div>

            <h3 className="mt-3 text-lg font-bold">{t.name}</h3>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                <Clock className="mx-auto h-4 w-4 text-brand-500" />
                <p className="mt-1 font-semibold">{t.duration}m</p>
              </div>
              <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                <FileText className="mx-auto h-4 w-4 text-accent-500" />
                <p className="mt-1 font-semibold">{t.questions} Q</p>
              </div>
              <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                <Award className="mx-auto h-4 w-4 text-violet-500" />
                <p className="mt-1 font-semibold">{t.marks}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Badge variant={t.difficulty}>{t.difficulty}</Badge>
              <span className="text-xs text-slate-400">
                {t.attempts.toLocaleString()} attempts
              </span>
            </div>

            {user ? (
              <Link to={`/test-series/${t.id}/attempt`} className="btn-primary mt-5 w-full">
                <Play className="h-4 w-4" /> Start Test
              </Link>
            ) : (
              <Link to="/login" className="btn-outline mt-5 w-full">
                <Lock className="h-4 w-4" /> Login to Start
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
