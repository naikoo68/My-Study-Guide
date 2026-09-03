import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ArrowRight, Layers, FileQuestion, ListChecks, HelpCircle } from "lucide-react";
import { contentService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import SubjectLogo from "../../components/ui/SubjectLogo";
import NodeStats from "../../components/ui/NodeStats";

export default function SubjectTopics() {
  const { subjectId } = useParams();
  const [subject, setSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([contentService.subjects(), contentService.topics(subjectId)])
      .then(([subjects, tps]) => {
        setSubject(subjects.find((s) => s._id === subjectId) || null);
        setTopics(tps);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [subjectId]);

  if (loading) return <div className="container-page"><Loading label="Loading topics..." /></div>;
  if (error) return <div className="container-page"><ErrorState message={error} onRetry={load} /></div>;
  if (!subject) {
    return (
      <div className="container-page py-20 text-center">
        <FileQuestion className="mx-auto h-12 w-12 text-slate-400" />
        <h2 className="mt-4 text-2xl font-bold">Subject not found</h2>
        <Link to="/public-quizzes" className="btn-primary mt-6">Back to subjects</Link>
      </div>
    );
  }

  const backTo = subject.stream ? `/public-quizzes/stream/${subject.stream}` : "/public-quizzes";

  return (
    <div className="container-page py-12">
      <Link to={backTo} className="btn-ghost mb-6 -ml-2 w-fit">
        <ChevronLeft className="h-4 w-4" /> Back to subjects
      </Link>

      <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
        <SubjectLogo name={subject.name} icon={subject.icon} color={subject.color} image={subject.image} size={64} />
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold">{subject.name}</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{subject.description}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{topics.length}</p>
          <p className="text-xs text-slate-500">Topics</p>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-bold">Topics</h2>
      {topics.length === 0 ? (
        <EmptyState message="No topics in this subject yet." />
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {topics.map((t, i) => (
            <Link
              key={t._id}
              to={`/public-quizzes/${subjectId}/${t._id}`}
              style={{ animationDelay: `${i * 50}ms` }}
              className="card-hover group flex animate-fade-in-up flex-col overflow-hidden p-0 opacity-0"
            >
              {/* Full-width banner with the topic icon centred */}
              <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-violet-500 to-fuchsia-600">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.28),transparent_60%)]" />
                <Layers className="relative h-10 w-10 text-white drop-shadow-md transition-transform duration-300 group-hover:scale-110" />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-white">{t.title}</h3>
                {t.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                )}
                <NodeStats
                  className="mt-4"
                  items={[
                    { icon: ListChecks, value: t.quizzes, label: "Quizzes" },
                    { icon: HelpCircle, value: t.questions, label: "Questions" },
                  ]}
                />
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
                  View sessions <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
