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

// Features that actually appear on the PUBLIC website (navbar, home, footer,
// the "Start Practicing" chooser). Only these get a "Public" switch — the rest
// are admin-only, so a public switch would do nothing.
const PUBLIC_FEATURES = new Set(["content", "tests", "practice", "study", "previousPapers", "performance"]);

// A small on/off switch (used for both the Admin and Public columns).
function Switch({ on, busy, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"}`}
    >
      {busy ? (
        <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
      ) : (
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      )}
    </button>
  );
}

export default function AdminFeatures() {
  const { settings, save } = useSettings();
  const adminFlags = useMemo(() => settings?.featureFlags || {}, [settings]);
  const publicFlags = useMemo(() => settings?.publicFeatureFlags || {}, [settings]);
  const [saving, setSaving] = useState(""); // `${kind}:${key}` of the switch mid-save
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // A feature is ON unless explicitly stored as false — tracked separately for
  // the admin panel and the public website.
  const isAdminOn = (key) => adminFlags[key] !== false;
  const isPublicOn = (key) => publicFlags[key] !== false;

  // kind = "admin" (featureFlags → sidebar/page) or "public" (publicFeatureFlags
  // → navbar/home/footer/chooser). The two are independent.
  const toggle = async (kind, key) => {
    const flags = kind === "admin" ? adminFlags : publicFlags;
    const curOn = flags[key] !== false;
    const field = kind === "admin" ? "featureFlags" : "publicFeatureFlags";
    const where = kind === "admin" ? "admin panel" : "public website";
    setSaving(`${kind}:${key}`);
    setMsg("");
    setErr("");
    try {
      await save({ [field]: { ...flags, [key]: !curOn } });
      setMsg(`${curOn ? "Hidden from" : "Shown on"} the ${where}.`);
    } catch (e) {
      setErr(e.message || "Could not save. Please try again.");
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <SlidersHorizontal className="h-6 w-6 text-brand-600" /> Features
        </h1>
        <p className="mt-0.5 text-slate-500 dark:text-slate-400">
          Show or hide each section — independently — in the <b>Admin</b> panel and on the <b>Public</b> website. Off just hides it; your data is always kept. The Public switch only applies to sections that appear on the public site.
        </p>
      </div>

      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">{msg}</p>}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">{err}</p>}

      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">{group.title}</h2>
          <div className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
            {/* Column headers — aligned over the two switch columns. */}
            <div className="flex items-center gap-3 px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <span className="w-10 flex-shrink-0" />
              <span className="min-w-0 flex-1" />
              <span className="flex items-center gap-6 pr-1">
                <span className="w-11 text-center">Admin</span>
                <span className="w-11 text-center">Public</span>
              </span>
            </div>
            {group.items.map((it) => {
              const adminOn = isAdminOn(it.key);
              const publicApplies = PUBLIC_FEATURES.has(it.key);
              const publicOn = isPublicOn(it.key);
              return (
                <div key={it.key} className="flex items-center gap-3 p-4">
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${adminOn ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                    <it.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{it.label}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{it.desc}</p>
                  </div>
                  <div className="flex items-center gap-6 pr-1">
                    <Switch
                      on={adminOn}
                      busy={saving === `admin:${it.key}`}
                      onClick={() => toggle("admin", it.key)}
                      label={`${adminOn ? "Hide" : "Show"} ${it.label} in the admin panel`}
                    />
                    {publicApplies ? (
                      <Switch
                        on={publicOn}
                        busy={saving === `public:${it.key}`}
                        onClick={() => toggle("public", it.key)}
                        label={`${publicOn ? "Hide" : "Show"} ${it.label} on the public website`}
                      />
                    ) : (
                      <span className="inline-flex h-6 w-11 items-center justify-center text-slate-300 dark:text-slate-600" title="Not shown on the public site">—</span>
                    )}
                  </div>
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
