import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { examService } from "../../services";
import { useSeo } from "../../lib/useSeo";
import { slugify } from "../../lib/slug";
import Breadcrumbs, { breadcrumbLd } from "../../components/ui/Breadcrumbs";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

// Public SEO landing page for one exam (e.g. /exams/ssc-cgl). Real data only:
// resolves the exam from GET /exams by matching a slug derived from its name,
// then lists its test series (GET /exams/:id/posts), each linking into the live
// test-series page (/test-series/:examId/:postId) where the tests are attempted.
export default function ExamLanding() {
  const { slug } = useParams();
  const [exam, setExam] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setNotFound(false); setPosts([]);
    examService
      .exams()
      .then((exams) => {
        const e = (Array.isArray(exams) ? exams : []).find((x) => slugify(x.name) === slug);
        if (!e) { if (alive) setNotFound(true); return null; }
        if (alive) setExam(e);
        return examService.posts(e._id).catch(() => []);
      })
      .then((ps) => { if (alive && ps) setPosts(Array.isArray(ps) ? ps : []); })
      .catch((err) => alive && setError(err.message || "Could not load this exam."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [slug]);

  const crumbs = exam
    ? [{ label: "Home", to: "/" }, { label: "Exams", to: "/exams" }, { label: exam.name }]
    : [];

  useSeo(
    exam ? exam.name : "Exam",
    exam
      ? (exam.description
          ? `${exam.description} Take ${exam.name} mock tests and test series on My Study Guide with instant results and detailed solutions.`
          : `Prepare for ${exam.name} with full-length mock tests and test series on My Study Guide — attempt online with instant results and detailed solutions.`)
      : undefined,
    undefined,
    exam ? breadcrumbLd(crumbs) : undefined
  );

  if (loading) return <div className="container-page py-12"><Loading label="Loading…" /></div>;
  if (error) return <div className="container-page py-12"><ErrorState message={error} /></div>;
  if (notFound) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-extrabold">Exam not found</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">This exam isn’t available.</p>
        <Link to="/exams" className="btn-primary mt-5 inline-flex">Browse all exams <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <Breadcrumbs items={crumbs} />
      <h1 className="text-3xl font-extrabold sm:text-4xl">{exam.name}</h1>
      <p className="mt-4 max-w-2xl text-slate-600 dark:text-slate-300">
        {exam.description
          || `Prepare for ${exam.name} with full-length mock tests and test series. Choose a test series below and attempt it online with instant results and detailed solutions.`}
      </p>

      <h2 className="mt-8 text-xl font-bold">Public test series for {exam.name}</h2>
      {posts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Public test series are being added. Meanwhile, <Link to="/test-series" className="text-brand-600 hover:underline dark:text-brand-400">browse all public test series</Link>.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link
              key={p._id}
              to={`/test-series/${exam._id}/${p._id}`}
              className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <h3 className="font-bold">{p.name}</h3>
              {p.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{p.description}</p>}
              <span className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                {typeof p.tests === "number" && <span>{p.tests} test{p.tests === 1 ? "" : "s"}</span>}
                <span className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400">Open <ArrowRight className="h-3.5 w-3.5" /></span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10">
        <Link to="/exams" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← All exams</Link>
      </div>
    </div>
  );
}
