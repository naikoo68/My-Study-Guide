import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { examService } from "../../services";
import { useSeo } from "../../lib/useSeo";
import { slugify } from "../../lib/slug";
import Breadcrumbs, { breadcrumbLd } from "../../components/ui/Breadcrumbs";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

// Public SEO hub listing every exam we offer test series / mock tests for, each
// linking to its own /exams/:slug landing page. Real data only (from GET /exams,
// which also returns a real count of test series per exam).
const CRUMBS = [{ label: "Home", to: "/" }, { label: "Exams" }];

export default function ExamsIndex() {
  useSeo(
    "Exams — Public Test Series & Mock Tests",
    "Browse every exam on My Study Guide and take full-length mock tests and public test series with instant results and detailed solutions.",
    undefined,
    breadcrumbLd(CRUMBS)
  );

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    examService
      .exams()
      .then((e) => alive && setExams(Array.isArray(e) ? e : []))
      .catch((err) => alive && setError(err.message || "Could not load exams."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return (
    <div className="container-page py-12">
      <Breadcrumbs items={CRUMBS} />
      <h1 className="text-3xl font-extrabold sm:text-4xl">Exams — Public Test Series &amp; Mock Tests</h1>
      <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
        Pick an exam to explore its full-length mock tests and public test series — attempt them online with instant results and detailed solutions.
      </p>

      {loading ? (
        <div className="mt-8"><Loading label="Loading exams…" /></div>
      ) : error ? (
        <div className="mt-8"><ErrorState message={error} /></div>
      ) : exams.length === 0 ? (
        <div className="mt-8"><EmptyState message="No exams available yet." /></div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((ex) => (
            <Link
              key={ex._id}
              to={`/exams/${slugify(ex.name)}`}
              className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <h2 className="font-bold">{ex.name}</h2>
              {ex.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{ex.description}</p>}
              <span className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                {typeof ex.posts === "number" && <span>{ex.posts} test series</span>}
                <span className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400">Explore <ArrowRight className="h-3.5 w-3.5" /></span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
