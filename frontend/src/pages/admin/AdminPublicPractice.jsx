import { Link } from "react-router-dom";
import { FolderOpen, BookCopy, FileStack } from "lucide-react";
import ContentSectionCards from "../../components/admin/ContentSectionCards";

// "Public Practice" folder — drilled into from the Manage Content page. Groups
// the two public content-building sections, each with an Enable/Disable switch.
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
];

export default function AdminPublicPractice() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/manage-content" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
          ← Manage Content
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <FolderOpen className="h-6 w-6 text-brand-600" /> Public Practice
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your public quizzes and public test series.
        </p>
      </div>

      <ContentSectionCards cards={CARDS} />
    </div>
  );
}
