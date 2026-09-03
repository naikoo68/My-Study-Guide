import { Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowRight, Search, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { contentService } from "../../services";
import { useAuth } from "../../context/AuthContext";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import { useSeo } from "../../lib/useSeo";

// Compact number so a big question bank stays tidy on the card (1234 -> "1.2k").
const fmtCount = (n) => {
  const v = Number(n || 0);
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(v);
};

// One cell in a stream card's at-a-glance stats grid.
function StreamStat({ icon: Ic, value, label }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-slate-50 px-1 py-2 dark:bg-slate-800/60">
      <Ic className="h-4 w-4 text-slate-400 dark:text-slate-500" />
      <span className="mt-1 text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{fmtCount(value)}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
    </div>
  );
}

// Top of the quiz hierarchy: pick a Stream (e.g. JKSSB) → then its subjects.
export default function QuizHome() {
  useSeo("Online Public Quizzes & Mock Tests", "Practise subject-wise online quizzes and mock tests with instant results and detailed solutions across every stream and topic on My Study Guide.");
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    contentService
      .streams()
      .then(setStreams)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = streams.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  // Admin has disabled quiz access for this student.
  if (user && user.quizAccess === false) {
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/50 dark:bg-amber-900/20">
          <Lock className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-extrabold">Quiz access disabled</h1>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            Quizzes have been turned off for your account. Please contact the administrator if you think this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Choose a Stream</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Pick a stream to explore its subject-wise quizzes.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search streams..."
            className="input pl-9"
          />
        </div>
      </div>

      {loading ? (
        <Loading label="Loading streams..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : streams.length === 0 ? (
        <EmptyState message="No streams available yet. Add some from the admin panel." />
      ) : (
        <>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s, i) => {
              const Icon = Icons[s.icon] || Icons.GraduationCap;
              return (
                <Link
                  key={s._id}
                  to={`/public-quizzes/stream/${s._id}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="card-hover group flex animate-fade-in-up flex-col overflow-hidden p-0 opacity-0"
                >
                  {/* Full-width banner — the stream's uploaded/AI logo, else its icon over the gradient */}
                  <div className={`relative flex h-40 items-center justify-center overflow-hidden ${s.image ? "" : `bg-gradient-to-br ${s.color}`}`}>
                    {s.image ? (
                      <img src={s.image} alt="" className="h-32 w-32 object-contain transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <>
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.28),transparent_60%)]" />
                        <Icon className="relative h-11 w-11 text-white drop-shadow-md transition-transform duration-300 group-hover:scale-110" />
                      </>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-white">{s.name}</h3>
                    {s.description && (
                      <p className="mt-1 line-clamp-3 text-xs text-slate-500 dark:text-slate-400">{s.description}</p>
                    )}

                    {/* At-a-glance size of the stream */}
                    <div className="mt-4 grid grid-cols-4 gap-1.5">
                      <StreamStat icon={Icons.FolderOpen} value={s.subjects} label="Subjects" />
                      <StreamStat icon={Icons.Layers} value={s.topics} label="Topics" />
                      <StreamStat icon={Icons.ListChecks} value={s.quizzes} label="Quizzes" />
                      <StreamStat icon={Icons.HelpCircle} value={s.questions} label="Questions" />
                    </div>

                    {/* Footer pinned to the bottom so every card lines up */}
                    <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                      <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Subject-wise quizzes</span>
                      <span className="flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
                        Explore <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <p className="mt-16 text-center text-slate-500">No streams match "{query}".</p>
          )}
        </>
      )}
    </div>
  );
}
