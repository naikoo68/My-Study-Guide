import { useState } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, GraduationCap, Store, School, ArrowRight } from "lucide-react";
import { useSeo } from "../lib/useSeo";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";
import { FAQ_DEFAULTS } from "../lib/faqDefaults";
import Breadcrumbs, { breadcrumbLd } from "../components/ui/Breadcrumbs";

// Audience metadata for the FAQ page. The actual Q&A content is admin-editable
// from Admin → Customization → FAQ (stored in settings.faqs.<audience>); when an
// audience hasn't been customised we fall back to the built-in FAQ_DEFAULTS.
// The SAME text shown on the page is emitted as FAQPage structured data for the
// active tab (Google requires the answer to be visible on the page).
const GROUPS = {
  student: {
    key: "student",
    label: "For Students",
    Icon: GraduationCap,
    intro: "Everything you need to know about quizzes, test series, subjects, results and preparing for your exams with My Study Guide.",
    ctas: [
      { label: "Browse quizzes", to: "/public-quizzes", primary: true },
      { label: "See student pricing", to: "/pricing" },
    ],
  },
  creator: {
    key: "creator",
    label: "For Creators",
    Icon: Store,
    intro: "For teachers and creators — what a Creator account includes and how to start building and sharing your own quizzes, tests and study material.",
    ctas: [
      { label: "Become a Creator", to: "/creator/register", primary: true },
      { label: "See Creator pricing", to: "/pricing" },
    ],
  },
  institute: {
    key: "institute",
    label: "For Institutes",
    Icon: School,
    intro: "For coaching institutes and schools — what an Institute account includes and how to launch your own branded platform.",
    ctas: [
      { label: "Register your institute", to: "/institute/register", primary: true },
      { label: "See Institute pricing", to: "/pricing" },
    ],
  },
};

// Helpful internal links (kept separate from answers so the visible answer text
// matches the FAQPage JSON-LD exactly — better for rich-result eligibility).
// `content: true` marks a PUBLIC content page (public quizzes/tests/etc.). These
// are hidden for a logged-in creator, who works in their own account and
// shouldn't be pushed to the public website's content. Pricing/Contact stay.
const EXPLORE = [
  { label: "Quizzes", to: "/choose/quiz", content: true },
  { label: "Test Series", to: "/choose/tests", content: true },
  { label: "Previous Papers", to: "/practice/paper", content: true },
  { label: "Study Material", to: "/study", content: true },
  { label: "Streams", to: "/streams", content: true },
  { label: "Exams", to: "/exams", content: true },
  { label: "Pricing", to: "/pricing" },
  { label: "Contact", to: "/contact" },
];

export default function Faq() {
  const { settings } = useSettings();
  const { user } = useAuth();
  // Any logged-in user only sees the non-content chips (Pricing/Contact); the
  // public content chips are hidden once you're signed in. (Role-independent.)
  const exploreLinks = user ? EXPLORE.filter((l) => !l.content) : EXPLORE;
  // Creator / Institute audiences are hidden platform-wide when the super-admin
  // turns off publicClientEnabled / publicInstituteEnabled (same rule as the
  // Pricing page), so we never advertise an audience that isn't open.
  const showCreator = settings?.publicClientEnabled !== false;
  const showInstitute = settings?.publicInstituteEnabled !== false;

  const tabs = [
    { key: "student", label: GROUPS.student.label, Icon: GraduationCap },
    ...(showCreator ? [{ key: "creator", label: GROUPS.creator.label, Icon: Store }] : []),
    ...(showInstitute ? [{ key: "institute", label: GROUPS.institute.label, Icon: School }] : []),
  ];

  const [audience, setAudience] = useState("student");
  // Guard against a hidden audience being active (e.g. if toggled off).
  const active = tabs.some((t) => t.key === audience) ? audience : "student";
  const group = GROUPS[active];

  // Prefer the admin-customised FAQs for this audience; fall back to the
  // built-in defaults when that audience hasn't been customised.
  const custom = settings?.faqs?.[active];
  const faqs = Array.isArray(custom) && custom.length ? custom : FAQ_DEFAULTS[active];

  const crumbs = [{ label: "Home", to: "/" }, { label: "FAQ" }];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      // Reuse the shared breadcrumb builder, nested under @graph (drop its
      // duplicate @context so the whole block is one valid graph).
      (({ "@context": _omit, ...rest }) => rest)(breadcrumbLd(crumbs)),
    ],
  };

  useSeo(
    "Frequently Asked Questions (FAQ)",
    "Answers to common questions about My Study Guide for students, creators and institutes — what each account includes, how to get started, pricing, results and more.",
    undefined,
    jsonLd
  );

  return (
    <div className="container-page py-14">
      <Breadcrumbs items={crumbs} />

      <div className="mx-auto max-w-3xl text-center">
        <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">FAQ</span>
        <h1 className="mt-4 text-4xl font-extrabold">Frequently Asked Questions</h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">{group.intro}</p>
      </div>

      {/* Audience toggle — Students / Creators / Institutes */}
      {tabs.length > 1 && (
        <div className="mx-auto mt-8 flex max-w-md items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/60">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setAudience(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition ${
                active === t.key ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-300"
              }`}
            >
              <t.Icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto mt-10 max-w-3xl space-y-4">
        {faqs.map((f, i) => (
          <div key={i} className="card p-6">
            <h2 className="flex items-start gap-3 text-lg font-bold text-slate-800 dark:text-slate-100">
              <HelpCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-500" />
              <span>{f.q}</span>
            </h2>
            <p className="mt-3 whitespace-pre-line pl-8 text-slate-600 dark:text-slate-300">{f.a}</p>
          </div>
        ))}
      </div>

      {/* How to get started — per-audience call to action */}
      <div className="mx-auto mt-8 flex max-w-3xl flex-wrap gap-3">
        {group.ctas.map((c) => (
          <Link key={c.to + c.label} to={c.to} className={c.primary ? "btn-primary" : "btn-outline"}>
            {c.label} <ArrowRight className="h-4 w-4" />
          </Link>
        ))}
      </div>

      <div className="mx-auto mt-12 max-w-3xl">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Explore My Study Guide</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {exploreLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-600 dark:hover:text-brand-400"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
