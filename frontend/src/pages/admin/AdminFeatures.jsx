import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  BookCopy,
  FileStack,
  GraduationCap,
  Files,
  SearchCheck,
  Share2,
  MonitorCheck,
  ArrowRightLeft,
  Ticket,
  BookMarked,
  FileText,
  Feather,
  FilePlus2,
  Trophy,
  DatabaseBackup,
  MessageSquare,
  Star,
  Mail,
  Megaphone,
  Sparkles,
  LayoutGrid,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Facebook as FacebookIcon } from "../../components/ui/SocialIcons";
import { useSettings } from "../../context/SettingsContext";

// Admin → Features. Turn admin-panel sections ON or OFF. A feature that's OFF
// disappears from the sidebar and its page is blocked (the backend also refuses
// to store the four core features as disabled). The list below MIRRORS the nav
// `feature` keys in AdminLayout — keep the two in sync when adding a feature.
//
// Grouped only for readability; the group has no effect on behaviour.
const GROUPS = [
  {
    title: "Content & practice",
    items: [
      { key: "content", label: "Content", icon: BookCopy, desc: "Streams, subjects, topics, sessions & quizzes." },
      { key: "tests", label: "Test Series", icon: FileStack, desc: "Build and manage full test series." },
      { key: "practice", label: "My Practice", icon: GraduationCap, desc: "Practice quizzes and test series." },
      { key: "previousPapers", label: "Previous Papers", icon: Files, desc: "Upload and organise previous-year papers." },
      { key: "checker", label: "Question Checker", icon: SearchCheck, desc: "Review and verify question quality." },
      { key: "study", label: "Study Material", icon: BookMarked, desc: "Institutions, subjects, classes & files." },
      { key: "documents", label: "Documents", icon: FileText, desc: "Standalone text documents & PDF extraction." },
      { key: "notes", label: "Handwritten Notes", icon: Feather, desc: "Generate and manage handwritten notes." },
      { key: "pdfBuilder", label: "PDF Builder", icon: FilePlus2, desc: "Compose printable PDFs from content." },
    ],
  },
  {
    title: "Exams & sharing",
    items: [
      { key: "cbt", label: "Online Exams", icon: MonitorCheck, desc: "CBT portal: registrations, live exams & results." },
      { key: "shared", label: "Shared Links", icon: Share2, desc: "Track quizzes/tests shared via link." },
      { key: "coupons", label: "Coupons", icon: Ticket, desc: "Discount coupons for checkout." },
      { key: "resume", label: "Resume Builder", icon: FileText, desc: "Student resume builder tool." },
      { key: "migration", label: "Migration", icon: ArrowRightLeft, desc: "Import/move data between databases." },
      { key: "backup", label: "Backup & Restore", icon: DatabaseBackup, desc: "Full content-library backup & restore." },
    ],
  },
  {
    title: "Engagement & AI",
    items: [
      { key: "performance", label: "Performance", icon: Trophy, desc: "Leaderboards and performance analytics." },
      { key: "feedback", label: "Feedback", icon: MessageSquare, desc: "Student feedback (per-question & overall)." },
      { key: "reviews", label: "Reviews", icon: Star, desc: "Student/client reviews (submit & approve)." },
      { key: "messages", label: "Messages", icon: Mail, desc: "Contact-form inbox." },
      { key: "notices", label: "Notice Board", icon: Megaphone, desc: "Scrolling public notice board." },
      { key: "facebook", label: "Facebook Auto-Post", icon: FacebookIcon, desc: "Scheduled Facebook/Instagram posting." },
      { key: "aiGenerator", label: "AI Generator", icon: Sparkles, desc: "AI question generator studio." },
      { key: "visualize", label: "Visualization Studio", icon: LayoutGrid, desc: "Turn questions into visual layouts." },
    ],
  },
];

// Core features the platform can't run without — always on, shown as locked so
// it's clear WHY they aren't in the toggle list. Mirrors the backend guard.
const ALWAYS_ON = [
  { label: "Users", desc: "Manage admins, clients and students." },
  { label: "AI Keys (APIs)", desc: "AI provider keys that power generation." },
  { label: "Storage", desc: "Database usage and cleanup." },
  { label: "Customization", desc: "Branding, theme and site settings." },
];

export default function AdminFeatures() {
  const { settings, save } = useSettings();
  const flags = useMemo(() => settings?.featureFlags || {}, [settings]);
  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // A feature is ON unless explicitly stored as false.
  const isOn = (key) => flags[key] !== false;

  const toggle = async (key) => {
    setSaving(key);
    setMsg("");
    setErr("");
    const next = { ...flags, [key]: !isOn(key) };
    try {
      await save({ featureFlags: next });
      setMsg(`${next[key] ? "Enabled" : "Disabled"} — sidebar updated.`);
    } catch (e) {
      setErr(e.message || "Could not save. Please try again.");
    } finally {
      setSaving("");
    }
  };

  const enabledCount = GROUPS.reduce((n, g) => n + g.items.filter((it) => isOn(it.key)).length, 0);
  const totalCount = GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <SlidersHorizontal className="h-6 w-6 text-brand-600" /> Features
        </h1>
        <p className="mt-0.5 text-slate-500 dark:text-slate-400">
          Turn admin-panel sections on or off. A section that's off is hidden from the sidebar and its page is blocked — your data is kept, nothing is deleted. {enabledCount}/{totalCount} enabled.
        </p>
      </div>

      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">{msg}</p>}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">{err}</p>}

      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">{group.title}</h2>
          <div className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
            {group.items.map((it) => {
              const on = isOn(it.key);
              const busy = saving === it.key;
              return (
                <div key={it.key} className="flex items-center gap-3 p-4">
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${on ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                    <it.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{it.label}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{it.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? "Disable" : "Enable"} ${it.label}`}
                    disabled={busy}
                    onClick={() => toggle(it.key)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"}`}
                  >
                    {busy ? (
                      <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                    ) : (
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Always on
        </h2>
        <div className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
          {ALWAYS_ON.map((it) => (
            <div key={it.label} className="flex items-center gap-3 p-4 opacity-70">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{it.label}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{it.desc}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Core
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
