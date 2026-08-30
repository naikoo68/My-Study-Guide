import { Link } from "react-router-dom";
import { FolderOpen, ListChecks, FileStack, ChevronRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";

// Landing page for the "Manage Content" sidebar item. Tapping the sidebar entry
// opens this page. "Public Practice" is a folder that drills down to the public
// quizzes / public test series sections; "My Quizzes" and "My Tests" open the
// personal practice manager locked to that kind.
const CARDS = [
  {
    to: "/admin/public-practice",
    label: "Public Practice",
    desc: "Public quizzes and public test series.",
    icon: FolderOpen,
    // A folder over two features — shown when EITHER is enabled.
    features: ["content", "tests"],
    tint: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  {
    to: "/admin/practice/quiz",
    label: "My Quizzes",
    desc: "Your own practice quizzes.",
    icon: ListChecks,
    feature: "practice",
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  {
    to: "/admin/practice/test",
    label: "My Tests",
    desc: "Your own practice tests.",
    icon: FileStack,
    feature: "practice",
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
];

export default function AdminManageContent() {
  const { user } = useAuth();
  const { settings } = useSettings();

  // Hide a card whose feature was turned off — globally (Admin → Features) or
  // for this institute — so it mirrors the sidebar / route-guard visibility.
  const instituteFeatures = user?.role === "institute_admin" ? (user?.tenant?.features || {}) : null;
  const globalFeatures = settings?.featureFlags || {};
  const isOn = (f) => {
    if (globalFeatures[f] === false) return false;
    if (instituteFeatures && instituteFeatures[f] === false) return false;
    return true;
  };
  const visible = (c) => (c.features ? c.features.some(isOn) : isOn(c.feature));
  const cards = CARDS.filter(visible);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <FolderOpen className="h-6 w-6 text-brand-600" /> Manage Content
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Build and manage your public quizzes, public test series and practice content.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="card group flex items-start gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${c.tint}`}>
              <c.icon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 font-bold">
                {c.label}
                <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
