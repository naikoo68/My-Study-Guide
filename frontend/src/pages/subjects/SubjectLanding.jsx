import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, Layers, FileStack, BookMarked } from "lucide-react";
import { contentService } from "../../services";
import { useSeo } from "../../lib/useSeo";
import Breadcrumbs, { breadcrumbLd } from "../../components/ui/Breadcrumbs";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

// Public SEO landing page for a single subject we offer, e.g. /subjects/accounting.
// Real data only: shows the subject, its stream, its topics, and links into the
// live quiz/test/study content, with breadcrumbs + BreadcrumbList structured data.
export default function SubjectLanding() {
  const { slug } = useParams();
  const [subject, setSubject] = useState(null);
  const [stream, setStream] = useState(null);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setNotFound(false); setTopics([]); setStream(null);
    Promise.all([contentService.subjects(), contentService.streams().catch(() => [])])
      .then(([subjects, streams]) => {
        const s = (Array.isArray(subjects) ? subjects : []).find((x) => x.slug === slug);
        if (!s) { if (alive) setNotFound(true); return null; }
        if (alive) {
          setSubject(s);
          setStream((Array.isArray(streams) ? streams : []).find((x) => x._id === s.stream) || null);
        }
        return contentService.topics(s._id).catch(() => []);
      })
      .then((tp) => { if (alive && tp) setTopics(Array.isArray(tp) ? tp : []); })
      .catch((e) => alive && setError(e.message || "Could not load this subject."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [slug]);

  const crumbs = subject
    ? (stream
        ? [{ label: "Home", to: "/" }, { label: "Streams", to: "/streams" }, { label: stream.name, to: stream.slug ? `/streams/${stream.slug}` : "/streams" }, { label: subject.name }]
        : [{ label: "Home", to: "/" }, { label: "Subjects", to: "/subjects" }, { label: subject.name }])
    : [];

  useSeo(
    subject ? subject.name : "Subject",
    subject
      ? (subject.description
          ? `${subject.description} Practise ${subject.name} quizzes and mock tests with instant results on My Study Guide.`
          : `Practise ${subject.name} quizzes and full-length mock tests with instant results and detailed solutions on My Study Guide.`)
      : undefined,
    undefined,
    subject ? breadcrumbLd(crumbs) : undefined
  );

  if (loading) return <div className="container-page py-12"><Loading label="Loading…" /></div>;
  if (error) return <div className="container-page py-12"><ErrorState message={error} /></div>;
  if (notFound) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-extrabold">Subject not found</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">This subject isn’t available.</p>
        <Link to="/subjects" className="btn-primary mt-5 inline-flex">Browse all subjects <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <Breadcrumbs items={crumbs} />

      <h1 className="text-3xl font-extrabold sm:text-4xl">{subject.name} Online Quizzes &amp; Practice Tests</h1>
      {stream && (
        <p className="mt-1 text-sm font-semibold text-brand-600 dark:text-brand-400">
          {stream.slug ? <Link to={`/streams/${stream.slug}`} className="hover:underline">{stream.name}</Link> : stream.name}
        </p>
      )}

      <p className="mt-4 max-w-2xl text-slate-600 dark:text-slate-300">
        {subject.description
          || `Practise ${subject.name} with subject-wise quizzes and full-length mock tests. Get instant results, detailed step-by-step solutions and track your progress and rank on My Study Guide.`}
      </p>

      {typeof subject.topics === "number" && (
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4" /> {subject.topics} topic{subject.topics === 1 ? "" : "s"}</span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={`/public-quizzes/${subject._id}`} className="btn-primary"><BookOpen className="h-4 w-4" /> Start {subject.name} quizzes <ArrowRight className="h-4 w-4" /></Link>
        <Link to="/public-test-series" className="btn-outline"><FileStack className="h-4 w-4" /> Public test series</Link>
        <Link to="/study" className="btn-outline"><BookMarked className="h-4 w-4" /> Study material</Link>
      </div>

      {topics.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Topics Covered</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((t) => (
              <Link
                key={t._id}
                to={`/public-quizzes/${subject._id}/${t._id}`}
                className="card flex items-center justify-between gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="font-medium">{t.title}</span>
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10">
        <Link to="/subjects" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← All subjects</Link>
      </div>
    </div>
  );
}
