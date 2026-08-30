import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { contentService } from "../../services";
import { useSeo } from "../../lib/useSeo";
import Breadcrumbs, { breadcrumbLd } from "../../components/ui/Breadcrumbs";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

// Public SEO hub listing every exam stream/course we offer, each linking to its
// own /streams/:slug landing page — the top of the crawlable content hierarchy
// (Home → Streams → Stream → Subjects → …).
const CRUMBS = [{ label: "Home", to: "/" }, { label: "Streams" }];

export default function StreamsIndex() {
  useSeo(
    "Exam Streams & Courses",
    "Browse all exam streams and courses on My Study Guide — pick a stream to explore its subjects, quizzes, mock tests and study material.",
    undefined,
    breadcrumbLd(CRUMBS)
  );

  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    contentService
      .streams()
      .then((s) => alive && setStreams(Array.isArray(s) ? s : []))
      .catch((e) => alive && setError(e.message || "Could not load streams."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return (
    <div className="container-page py-12">
      <Breadcrumbs items={CRUMBS} />
      <h1 className="text-3xl font-extrabold sm:text-4xl">Exam Streams &amp; Courses</h1>
      <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
        Choose a stream to explore its subjects, quizzes, full-length mock tests and study material — with instant results and detailed solutions.
      </p>

      {loading ? (
        <div className="mt-8"><Loading label="Loading streams…" /></div>
      ) : error ? (
        <div className="mt-8"><ErrorState message={error} /></div>
      ) : streams.length === 0 ? (
        <div className="mt-8"><EmptyState message="No streams available yet." /></div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {streams.map((s) => (
            <Link
              key={s._id}
              to={s.slug ? `/streams/${s.slug}` : "/public-quizzes"}
              className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <h2 className="font-bold">{s.name}</h2>
              {s.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.description}</p>}
              <span className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                {typeof s.subjects === "number" && <span>{s.subjects} subject{s.subjects === 1 ? "" : "s"}</span>}
                <span className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400">Explore <ArrowRight className="h-3.5 w-3.5" /></span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
