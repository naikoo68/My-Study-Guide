import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Layers } from "lucide-react";
import { contentService } from "../../services";
import { useSeo } from "../../lib/useSeo";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

// Public SEO hub: lists every real subject we offer (grouped by stream), each
// linking to its own /subjects/:slug landing page. Crawlable internal-link hub
// so search engines discover all subject pages.
export default function SubjectsIndex() {
  useSeo(
    "Subjects & Streams",
    "Browse all subjects and exam streams on My Study Guide — practise subject-wise quizzes and full-length mock tests with instant results and detailed solutions."
  );

  const [subjects, setSubjects] = useState([]);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([contentService.subjects(), contentService.streams().catch(() => [])])
      .then(([subs, strs]) => {
        if (!alive) return;
        setSubjects(Array.isArray(subs) ? subs : []);
        setStreams(Array.isArray(strs) ? strs : []);
      })
      .catch((e) => alive && setError(e.message || "Could not load subjects."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const streamName = (id) => streams.find((s) => s._id === id)?.name;
  const groups = {};
  for (const s of subjects) {
    const key = streamName(s.stream) || "Other subjects";
    (groups[key] = groups[key] || []).push(s);
  }
  const groupNames = Object.keys(groups).sort();

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Subjects &amp; Streams</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          Pick a subject to practise quizzes and full-length mock tests — with instant results, detailed solutions and progress tracking.
        </p>
      </div>

      {loading ? (
        <div className="mt-8"><Loading label="Loading subjects…" /></div>
      ) : error ? (
        <div className="mt-8"><ErrorState message={error} /></div>
      ) : subjects.length === 0 ? (
        <div className="mt-8"><EmptyState message="No subjects available yet." /></div>
      ) : (
        <div className="mt-10 space-y-10">
          {groupNames.map((g) => (
            <section key={g}>
              <h2 className="mb-4 text-xl font-bold">{g}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups[g].map((s) => (
                  <Link
                    key={s._id}
                    to={s.slug ? `/subjects/${s.slug}` : `/public-quizzes/${s._id}`}
                    className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <h3 className="font-bold">{s.name}</h3>
                    {s.description && (
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.description}</p>
                    )}
                    <span className="mt-3 inline-flex items-center gap-2 text-sm text-slate-400">
                      {typeof s.topics === "number" && (
                        <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {s.topics} topic{s.topics === 1 ? "" : "s"}</span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400">Practise <ArrowRight className="h-3.5 w-3.5" /></span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
