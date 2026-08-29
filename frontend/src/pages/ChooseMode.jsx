import { Link, useParams, Navigate } from "react-router-dom";
import { ChevronLeft, ArrowRight, ListChecks, FileStack, Trophy, FileText, BookOpen } from "lucide-react";

// A simple chooser PAGE. The home hero's "Start Practicing" / "Explore Test
// Series" buttons open this so the user first lands here, then picks between
// their OWN content and the PUBLIC content.
const MODES = {
  practice: {
    title: "Start Practicing",
    subtitle: "Where would you like to practice?",
    options: [
      {
        to: "/practice",
        Icon: ListChecks,
        color: "from-brand-600 to-blue-600",
        title: "My Practice",
        desc: "Your own quizzes & tests — the ones you built or that were shared with you.",
      },
      {
        to: "/choose/tests",
        Icon: FileStack,
        color: "from-amber-500 to-orange-600",
        title: "Explore Test Series",
        desc: "Full-length & sectional mock tests with real exam timing.",
      },
      {
        to: "/practice/paper",
        Icon: FileText,
        color: "from-violet-600 to-purple-600",
        title: "Previous Papers",
        desc: "Practise from previous years' question papers.",
      },
      {
        to: "/study",
        Icon: BookOpen,
        color: "from-rose-500 to-pink-600",
        title: "Study Material",
        desc: "Curated notes, PDFs and resources to revise faster.",
      },
    ],
  },
  tests: {
    title: "Explore Test Series",
    subtitle: "Which test series would you like to open?",
    options: [
      {
        to: "/practice/test",
        Icon: FileStack,
        color: "from-brand-600 to-blue-600",
        title: "My Tests",
        desc: "Your own test series that you created or received.",
      },
      {
        to: "/test-series",
        Icon: Trophy,
        color: "from-amber-500 to-orange-600",
        title: "Test Series",
        desc: "Public full-length & sectional mock tests with real exam timing.",
      },
    ],
  },
};

export default function ChooseMode() {
  const { mode } = useParams();
  const cfg = MODES[mode];
  if (!cfg) return <Navigate to="/" replace />;
  const many = cfg.options.length >= 3; // wider grid when there are 3+ options

  return (
    <div className="container-page py-12">
      <Link to="/" className="btn-ghost -ml-2 mb-6 w-fit">
        <ChevronLeft className="h-4 w-4" /> Back to home
      </Link>

      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{cfg.title}</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">{cfg.subtitle}</p>
      </div>

      <div className={`mx-auto mt-8 grid gap-5 sm:grid-cols-2 ${many ? "max-w-5xl lg:grid-cols-3" : "max-w-3xl"}`}>
        {cfg.options.map(({ to, Icon, color, title, desc }) => (
          <Link key={to} to={to} className="card-hover group flex flex-col p-6">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-white shadow-soft`}>
              <Icon className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-xl font-bold">{title}</h3>
            <p className="mt-1 flex-1 text-sm text-slate-500 dark:text-slate-400">{desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
              Open <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
