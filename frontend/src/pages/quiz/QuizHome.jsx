import { Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { contentService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

export default function QuizHome() {
  const [query, setQuery] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    contentService
      .subjects()
      .then(setSubjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = subjects.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="container-page py-12">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Choose a Subject</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Pick a subject to explore chapter-wise quiz sessions.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subjects..."
            className="input pl-9"
          />
        </div>
      </div>

      {loading ? (
        <Loading label="Loading subjects..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : subjects.length === 0 ? (
        <EmptyState message="No subjects available yet. Add some from the admin panel." />
      ) : (
        <>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s, i) => {
              const Icon = Icons[s.icon] || Icons.BookOpen;
              return (
                <Link
                  key={s._id}
                  to={`/quiz/${s._id}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="card-hover group animate-fade-in-up p-6 opacity-0"
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white shadow-soft`}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{s.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                    {s.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {s.topics} topics
                    </span>
                    <span className="flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
                      Start Learning <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <p className="mt-16 text-center text-slate-500">No subjects match "{query}".</p>
          )}
        </>
      )}
    </div>
  );
}
