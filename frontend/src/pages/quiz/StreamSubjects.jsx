import { Link, useParams } from "react-router-dom";
import { ArrowRight, Search, ChevronLeft, FileQuestion, Layers, ListChecks, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { contentService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import SubjectLogo from "../../components/ui/SubjectLogo";
import NodeStats from "../../components/ui/NodeStats";

// Subjects inside a chosen stream. Each subject links to its topics (unchanged).
export default function StreamSubjects() {
  const { streamId } = useParams();
  const [query, setQuery] = useState("");
  const [stream, setStream] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([contentService.streams(), contentService.subjectsByStream(streamId)])
      .then(([streams, subs]) => {
        setStream(streams.find((s) => s._id === streamId) || null);
        setSubjects(subs);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [streamId]);

  const filtered = subjects.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  if (loading) return <div className="container-page"><Loading label="Loading subjects..." /></div>;
  if (error) return <div className="container-page"><ErrorState message={error} onRetry={load} /></div>;
  if (!stream) {
    return (
      <div className="container-page py-20 text-center">
        <FileQuestion className="mx-auto h-12 w-12 text-slate-400" />
        <h2 className="mt-4 text-2xl font-bold">Stream not found</h2>
        <Link to="/public-quizzes" className="btn-primary mt-6">Back to streams</Link>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <Link to="/public-quizzes" className="btn-ghost mb-6 -ml-2 w-fit">
        <ChevronLeft className="h-4 w-4" /> All streams
      </Link>

      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{stream.name}</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            {stream.description || "Pick a subject to explore chapter-wise quiz sessions."}
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

      {subjects.length === 0 ? (
        <EmptyState message="No subjects in this stream yet." />
      ) : (
        <>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s, i) => {
              return (
                <Link
                  key={s._id}
                  to={`/public-quizzes/${s._id}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="card-hover group flex animate-fade-in-up flex-col overflow-hidden p-0 opacity-0"
                >
                  {/* Full-bleed subject logo banner (uploaded image → auto emoji/colour) */}
                  <div className="relative flex h-24 items-center justify-center overflow-hidden">
                    <SubjectLogo fill name={s.name} icon={s.icon} color={s.color} image={s.image} className="transition-transform duration-300 group-hover:scale-105" />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-white">{s.name}</h3>
                    {s.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{s.description}</p>}
                    <NodeStats
                      className="mt-4"
                      items={[
                        { icon: Layers, value: s.topics, label: "Topics" },
                        { icon: ListChecks, value: s.quizzes, label: "Quizzes" },
                        { icon: HelpCircle, value: s.questions, label: "Questions" },
                      ]}
                    />
                    <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
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
