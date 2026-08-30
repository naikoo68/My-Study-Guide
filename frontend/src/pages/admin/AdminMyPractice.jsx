import { Link } from "react-router-dom";
import { FolderOpen, ListChecks, FileStack } from "lucide-react";
import ContentSectionCards from "../../components/admin/ContentSectionCards";

// "My Practice" folder — drilled into from the Manage Content page. Groups the
// two personal practice sections (locked to a single kind each). Both map to
// the "practice" feature, so their Enable/Disable switches move together.
const CARDS = [
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

export default function AdminMyPractice() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/manage-content" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
          ← Manage Content
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <FolderOpen className="h-6 w-6 text-brand-600" /> My Practice
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your own practice quizzes and tests.
        </p>
      </div>

      <ContentSectionCards cards={CARDS} />
    </div>
  );
}
