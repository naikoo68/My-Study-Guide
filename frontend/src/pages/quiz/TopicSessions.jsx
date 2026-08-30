import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Play, HelpCircle, Layers, ListChecks } from "lucide-react";
import { contentService } from "../../services";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

// Public topic page (shown BEFORE opening the quizzes). It rolls up the topic's
// quizzes + total questions, and lists the "Topics covered" — the subtopics that
// have actually been covered, gathered from each quiz's saved subtopics (which
// are populated by "Scan Missing Areas" and by adding subtopics manually when
// generating). The admin Session level is hidden, so we present it topic-first.
export default function TopicSessions() {
  const { subjectId, topicId } = useParams();
  const [topic, setTopic] = useState(null);
  const [sessions, setSessions] = useState([]); // each: { ...session, quizzes, questionCount, subtopics: [] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([contentService.topics(subjectId), contentService.sessions(topicId)])
      .then(async ([topics, sess]) => {
        setTopic(topics.find((t) => t._id === topicId) || null);
        // For each session, pull its quizzes so we can total the questions and
        // collect the covered subtopics (each quiz remembers the subtopics it was
        // built for — from a missing-areas scan or a manual list).
        const withDetails = await Promise.all(
          (sess || []).map(async (s) => {
            let quizzes = [];
            try { quizzes = await contentService.quizzes(s._id); } catch { quizzes = []; }
            const questionCount = quizzes.reduce((n, q) => n + (q.questions || 0), 0);
            const subtopics = [];
            for (const q of quizzes) {
              String(q.aiSubtopics || "")
                .split(/[,;\n]+/)
                .map((x) => x.trim())
                .filter(Boolean)
                .forEach((x) => subtopics.push(x));
            }
            return { ...s, questionCount, subtopics };
          })
        );
        setSessions(withDetails);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [subjectId, topicId]);

  if (loading) return <div className="container-page"><Loading label="Loading topic..." /></div>;
  if (error) return <div className="container-page"><ErrorState message={error} onRetry={load} /></div>;

  const totalQuizzes = sessions.reduce((n, s) => n + (s.quizzes || 0), 0);
  const totalQuestions = sessions.reduce((n, s) => n + (s.questionCount || 0), 0);

  // Every covered subtopic across the topic's quizzes, de-duplicated (case-insensitive).
  const coveredTopics = (() => {
    const seen = new Set();
    const out = [];
    for (const s of sessions) {
      for (const t of s.subtopics || []) {
        const k = t.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(t); }
      }
    }
    return out;
  })();

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <div className="container-page py-12">
      <Link to={`/quiz/${subjectId}`} className="btn-ghost mb-6 -ml-2 w-fit">
        <ChevronLeft className="h-4 w-4" /> Back to topics
      </Link>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-medium text-accent-600 dark:text-accent-400">Topic</p>
        <h1 className="text-3xl font-extrabold">{topic?.title || "Topic"}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4" /> {totalQuizzes} {totalQuizzes === 1 ? "quiz" : "quizzes"}</span>
          <span className="inline-flex items-center gap-1.5"><HelpCircle className="h-4 w-4" /> {plural(totalQuestions, "question")}</span>
        </p>
      </div>

      <h2 className="mt-10 flex items-center gap-2 text-xl font-bold"><ListChecks className="h-5 w-5 text-brand-600" /> Topics covered</h2>
      {coveredTopics.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {coveredTopics.map((t, i) => (
            <span key={`${t}-${i}`} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              {t}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Subtopics appear here as questions are added — through “Scan Missing Areas” or by adding subtopics manually when generating.
        </p>
      )}

      {sessions.length === 0 ? (
        <EmptyState message="No quizzes in this topic yet." />
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s, i) => (
            <Link
              key={s._id}
              to={`/quiz/${subjectId}/${topicId}/${s._id}`}
              style={{ animationDelay: `${i * 50}ms` }}
              className="card-hover animate-fade-in-up flex flex-col p-6 opacity-0"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-sm font-bold text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                  {s.index}
                </span>
                <Badge variant={s.difficulty}>{s.difficulty}</Badge>
              </div>
              <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4" /> {s.quizzes ?? 0} quizzes</span>
                <span className="inline-flex items-center gap-1.5"><HelpCircle className="h-4 w-4" /> {s.questionCount ?? 0} questions</span>
              </p>
              <span className="btn-primary mt-auto w-full">
                <Play className="h-4 w-4" /> View Quizzes
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
