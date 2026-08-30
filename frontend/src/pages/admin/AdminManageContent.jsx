import { Link } from "react-router-dom";
import { FolderOpen, BookCopy, FileStack, GraduationCap, ChevronRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";

// Landing page for the "Manage Content" sidebar item. Tapping the sidebar entry
// opens this page, which shows the three content-building sections as cards.
const CARDS = [
  {
    to: "/admin/content",
    label: "Public Quizzes",
    desc: "Streams, subjects, topics, sessions & quizzes.",
    icon: BookCopy,
    feature: "content",
    tint: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  },
  {
    to: "/admin/tests",
    label: "Public Test Series",
    desc: "Build and manage full test series.",
    icon: FileStack,
    feature: "tests",
    tint: "bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300",
  },
  {
    to: "/admin/practice",
    label: "My Practice",
    desc: "Practice quizzes and test series.",
    icon: GraduationCap,
    feature: "practice",
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
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
  const cards = CARDS.filter((c) => isOn(c.feature));

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
