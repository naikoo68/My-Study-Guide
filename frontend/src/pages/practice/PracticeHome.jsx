import { Link } from "react-router-dom";
import { ListChecks, Globe, ArrowRight } from "lucide-react";
import { useSeo } from "../../lib/useSeo";
import { useSettings } from "../../context/SettingsContext";
import { publicFeatureEnabled } from "../../lib/features";

// "Practice Quizzes" landing — My Quiz + Public Quizzes. (My Test lives under
// Explore Test Series → My Tests, so it's not duplicated here.)
export default function PracticeHome() {
  useSeo("Practice Questions & Tests", "Practise questions, quizzes, tests and previous papers with instant solutions and progress tracking on My Study Guide.");
  const { settings } = useSettings();
  const cards = [
    { to: "/practice/quiz", label: "My Quiz", desc: "Curated practice quizzes shared with you.", Icon: ListChecks, cls: "from-violet-500 to-fuchsia-600", feature: "practiceQuiz" },
    { to: "/public-quizzes", label: "Public Quizzes", desc: "Everyone's subject-wise quizzes with instant, detailed solutions.", Icon: Globe, cls: "from-emerald-500 to-teal-600", feature: "content" },
  ].filter((c) => publicFeatureEnabled(settings, c.feature));
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">My Practice</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Your assigned practice content. Pick a category to begin.</p>
      </div>
      <div className="mx-auto mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="card-hover group p-8">
            <span className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${c.cls} text-white shadow-soft`}>
              <c.Icon className="h-8 w-8" />
            </span>
            <h3 className="mt-5 text-xl font-bold">{c.label}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
              Open <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
