import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { contentService } from "../../services";
import { useSeo } from "../../lib/useSeo";
import Breadcrumbs, { breadcrumbLd } from "../../components/ui/Breadcrumbs";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

// Public SEO landing page for one exam stream we offer (e.g. /streams/commerce).
// Real data only; lists the stream's subjects and links into each subject page.
export default function StreamLanding() {
  const { slug } = useParams();
  const [stream, setStream] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setNotFound(false); setSubjects([]);
    contentService
      .streams()
      .then((streams) => {
        const s = (Array.isArray(streams) ? streams : []).find((x) => x.slug === slug);
        if (!s) { if (alive) setNotFound(true); return null; }
        if (alive) setStream(s);
        return contentService.subjectsByStream(s._id).catch(() => []);
      })
      .then((subs) => { if (alive && subs) setSubjects(Array.isArray(subs) ? subs : []); })
      .catch((e) => alive && setError(e.message || "Could not load this stream."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [slug]);

  const crumbs = stream
    ? [{ label: "Home", to: "/" }, { label: "Streams", to: "/streams" }, { label: stream.name }]
    : [];

  useSeo(
    stream ? stream.name : "Stream",
    stream
      ? (stream.description
          ? `${stream.description} Explore ${stream.name} subjects, quizzes, mock tests and study material on My Study Guide.`
          : `Explore ${stream.name} subjects, quizzes, full-length mock tests and study material on My Study Guide.`)
      : undefined,
    undefined,
    stream ? breadcrumbLd(crumbs) : undefined
  );

  if (loading) return <div className="container-page py-12"><Loading label="Loading…" /></div>;
  if (error) return <div className="container-page py-12"><ErrorState message={error} /></div>;
  if (notFound) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-extrabold">Stream not found</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">This stream isn’t available.</p>
        <Link to="/streams" className="btn-primary mt-5 inline-flex">Browse all streams <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <Breadcrumbs items={crumbs} />
      <h1 className="text-3xl font-extrabold sm:text-4xl">{stream.name}</h1>
      <p className="mt-4 max-w-2xl text-slate-600 dark:text-slate-300">
        {stream.description
          || `Prepare for ${stream.name} with subject-wise quizzes, full-length mock tests and curated study material. Pick a subject below to start practising with instant results and detailed solutions.`}
      </p>

      <h2 className="mt-8 text-xl font-bold">Subjects in {stream.name}</h2>
      {subjects.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Subjects are being added. Meanwhile, <Link to="/public-quizzes" className="text-brand-600 hover:underline dark:text-brand-400">browse all quizzes</Link>.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <Link
              key={s._id}
              to={s.slug ? `/subjects/${s.slug}` : `/public-quizzes/${s._id}`}
              className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <h3 className="font-bold">{s.name}</h3>
              {s.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.description}</p>}
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">Practise <ArrowRight className="h-3.5 w-3.5" /></span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10">
        <Link to="/streams" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← All streams</Link>
      </div>
    </div>
  );
}
