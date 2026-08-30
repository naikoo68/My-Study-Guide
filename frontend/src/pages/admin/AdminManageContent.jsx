import { FolderOpen, GraduationCap } from "lucide-react";
import ContentSectionCards from "../../components/admin/ContentSectionCards";

// Landing page for the "Manage Content" sidebar item. Both cards are folders
// that drill down:
//   • Public Practice → Public Quizzes, Public Test Series
//   • My Practice     → My Quizzes, My Tests
// Each card also carries an Enable/Disable switch (student/public visibility).
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
    to: "/admin/my-practice",
    label: "My Practice",
    desc: "Your own practice quizzes and tests.",
    icon: GraduationCap,
    feature: "practice",
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
];

export default function AdminManageContent() {
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

      <ContentSectionCards cards={CARDS} />
    </div>
  );
}
