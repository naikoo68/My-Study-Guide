import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, LayoutDashboard, Wrench, ArrowRightLeft, Sparkles, FileText, Feather,
  ListChecks, FileStack, HelpCircle, Play, Download, Globe, RefreshCw, Wand2, Search,
  Crown, GraduationCap, FolderOpen, Layers, ShieldCheck,
} from "lucide-react";
import { authService, practiceService, aiService } from "../../services";
import { useAuth } from "../../context/AuthContext";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

// A living USER MANUAL for clients. Everything here reflects the account's
// CURRENT state — the guides that show depend on which features are enabled for
// this client (AI / Documents / Notes), and the "What's on your account"
// overview + plan limits are read live from the API, so the manual updates
// automatically whenever content is added/deleted or access changes. Nothing
// is hard-coded that would go stale.
export default function ClientUserManual({ onGoTab }) {
  const { user } = useAuth();
  const hasAI = !!user?.aiAccess;

  const [items, setItems] = useState([]);
  const [planInfo, setPlanInfo] = useState(null);
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      practiceService.myItems().catch(() => []),
      authService.plans().catch(() => ({ plans: [] })),
      hasAI ? aiService.status().catch(() => null) : Promise.resolve(null),
    ])
      .then(([myItems, plansRes, aiStatus]) => {
        setItems(Array.isArray(myItems) ? myItems : []);
        setPlanInfo((plansRes?.plans || []).find((p) => p.key === user?.subscriptionPlan) || null);
        setAi(aiStatus);
      })
      .catch((e) => setError(e.message || "Could not load your manual."))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  // Live overview derived from the client's OWN content — auto-updates on
  // add/delete because it is recomputed from the fresh myItems() every load.
  const overview = useMemo(() => {
    const quizzes = items.filter((i) => i.kind === "quiz");
    const tests = items.filter((i) => i.kind === "test");
    const distinct = (arr, key) => new Set(arr.map((x) => x[key]?._id).filter(Boolean)).size;
    const totalQ = items.reduce((s, i) => s + (i.questionCount || 0), 0);
    // Group streams → how many quizzes/tests sit under each (for the live list).
    const streamMap = new Map();
    for (const it of items) {
      const s = it.stream;
      if (!s?._id) continue;
      const cur = streamMap.get(String(s._id)) || { name: s.name, quizzes: 0, tests: 0 };
      if (it.kind === "quiz") cur.quizzes += 1; else cur.tests += 1;
      streamMap.set(String(s._id), cur);
    }
    return {
      quizzes: quizzes.length,
      tests: tests.length,
      totalQ,
      streams: distinct(items, "stream"),
      subjects: distinct(quizzes, "subject"),
      topics: distinct(quizzes, "topic"),
      streamList: [...streamMap.values()],
    };
  }, [items]);

  // Feature guides. Each is gated by what THIS client can actually do, so the
  // manual only documents features that are available to them right now.
  const guides = [
    {
      key: "dashboard", tab: "dashboard", Icon: LayoutDashboard, title: "Dashboard — practice your content",
      steps: [
        "Open the Dashboard tab to see everything you've built.",
        "Switch between My Quiz and My Test, then drill Stream → Subject → Topic → Quiz (tests go Stream → Test).",
        "Tap Practice / Take Test to start. Use the search box to find any quiz, test or question instantly.",
        "Use the download icon on any item to export a question paper or answer key (PDF).",
      ],
      show: true,
    },
    {
      key: "build", tab: "build", Icon: Wrench, title: "Build — create quizzes & tests",
      steps: [
        "Open the Build tab to create your own Streams, Subjects, Topics, Quizzes and Tests.",
        "Add questions manually, bulk-upload them, or pick from your question bank.",
        hasAI ? "Or use Generate with AI / Import from Web to create questions automatically." : "Ask your administrator to enable AI to generate questions automatically.",
        "Every quiz/test you add here appears on your Dashboard immediately.",
      ],
      show: true,
    },
    {
      key: "ai", tab: "ai", Icon: Sparkles, title: "AI — generate questions",
      steps: [
        "In Build, choose Generate with AI: type a topic (or paste a link/YouTube URL), pick how many questions of each type & difficulty, then Generate.",
        "Review the preview and Insert — you can Generate more from the same topic without duplicates, and send a batch to the current or a new quiz.",
        "Import from Web extracts questions from a PDF/document/web page, or generates fresh ones from a source.",
        "On any question, use Regenerate to rebuild its options/answer, or Extend explanation to enrich it.",
        "In the AI tab you can choose built-in AI or add your own API keys.",
      ],
      show: hasAI,
    },
    {
      key: "documents", tab: "documents", Icon: FileText, title: "Documents — write & render",
      steps: [
        "Open the Documents tab to write notes and render equations.",
        "Use Copy for Word to paste rendered equations straight into notes or MS Word.",
        "Saved documents can be used as a source when importing questions with AI.",
      ],
      show: hasAI,
    },
    {
      key: "notes", tab: "notes", Icon: Feather, title: "Notes — AI study notes",
      steps: [
        "Open the Notes tab to generate clean, structured study notes on any topic with AI.",
      ],
      show: hasAI,
    },
    {
      key: "migrate", tab: "migrate", Icon: ArrowRightLeft, title: "Migrate — move content",
      steps: [
        "Open the Migrate tab to move or copy quizzes/tests and their questions between streams, subjects or topics.",
      ],
      show: true,
    },
  ].filter((g) => g.show);

  const Stat = ({ value, label, Icon }) => (
    <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/50">
      <Icon className="mx-auto mb-1 h-4 w-4 text-brand-500" />
      <p className="text-lg font-extrabold text-slate-700 dark:text-slate-200">{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold leading-none">User Manual</h1>
            <p className="mt-1 text-sm text-slate-400">A quick guide to your account — updates automatically as you add or remove content.</p>
          </div>
          <button onClick={load} title="Refresh" className="btn-ghost ml-auto"><RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Refresh</span></button>
        </div>
      </div>

      {loading ? (
        <div className="card p-6"><Loading label="Loading your manual..." /></div>
      ) : error ? (
        <div className="card p-6"><ErrorState message={error} onRetry={load} /></div>
      ) : (
        <>
          {/* LIVE overview — reflects your current content */}
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-emerald-600" /> What's on your account now</h2>
            <p className="mt-0.5 text-xs text-slate-400">This is read live — add or delete a quiz/test and it changes here automatically.</p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat value={overview.quizzes} label="Quizzes" Icon={ListChecks} />
              <Stat value={overview.tests} label="Tests" Icon={FileStack} />
              <Stat value={overview.totalQ} label="Questions" Icon={HelpCircle} />
              <Stat value={overview.streams} label="Streams" Icon={GraduationCap} />
              <Stat value={overview.subjects} label="Subjects" Icon={FolderOpen} />
              <Stat value={overview.topics} label="Topics" Icon={Layers} />
            </div>

            {overview.streamList.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Your streams</p>
                <div className="flex flex-wrap gap-2">
                  {overview.streamList.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-700">
                      <GraduationCap className="h-3.5 w-3.5 text-brand-500" />
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-slate-400">{s.quizzes} quiz{s.quizzes === 1 ? "" : "zes"}{s.tests ? `, ${s.tests} test${s.tests === 1 ? "" : "s"}` : ""}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {items.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400">You haven't built any quizzes or tests yet.</p>
                {onGoTab && <button onClick={() => onGoTab("build")} className="btn-outline mt-3"><Wrench className="h-4 w-4" /> Go to Build</button>}
              </div>
            )}
          </div>

          {/* Plan & limits — reflects the plan assigned to this client */}
          {(planInfo || ai?.planName) && (
            <div className="card p-5">
              <h2 className="flex items-center gap-2 font-bold"><Crown className="h-4 w-4 text-amber-500" /> Your plan &amp; limits</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Plan: <span className="font-semibold">{planInfo?.label || ai?.planName}</span>
                {planInfo?.price ? <span className="text-slate-400"> · ₹{planInfo.price}</span> : null}
              </p>
              {hasAI && (planInfo?.maxPerBatch || ai?.maxPerBatch) && (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Stat value={planInfo?.maxPerBatch || ai?.maxPerBatch} label="Questions / batch" Icon={Sparkles} />
                    <Stat value={planInfo?.perWindow ?? ai?.perWindow ?? "—"} label="Questions / window" Icon={RefreshCw} />
                    <Stat value={`${planInfo?.windowMinutes || ai?.windowMinutes || 5} min`} label="Window" Icon={HelpCircle} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">These are your AI question-generation limits. {ai?.remaining != null ? `${ai.remaining} left in the current window.` : ""}</p>
                </>
              )}
            </div>
          )}

          {/* How-to guides — only the features available to you are shown */}
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-bold"><BookOpen className="h-4 w-4 text-brand-600" /> How to use your workspace</h2>
            <p className="mt-0.5 text-xs text-slate-400">Only the tools enabled for your account are listed{hasAI ? "" : " — ask your administrator to enable AI for more"}.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {guides.map((g) => (
                <div key={g.key} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"><g.Icon className="h-4 w-4" /></span>
                    <h3 className="font-bold">{g.title}</h3>
                  </div>
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
                    {g.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  {onGoTab && (
                    <button onClick={() => onGoTab(g.tab)} className="btn-ghost mt-3 text-xs text-brand-600">
                      Open {g.title.split(" — ")[0]} <ArrowRightLeft className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick tips */}
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-bold"><HelpCircle className="h-4 w-4 text-brand-600" /> Tips</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex gap-2"><Search className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" /> Use the search box on the Dashboard to find any quiz, test or question by name or content.</li>
              <li className="flex gap-2"><Play className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" /> A quiz/test needs at least one question before you can practise it.</li>
              <li className="flex gap-2"><Download className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" /> Export any quiz/test as a printable paper or answer key from its card.</li>
              {hasAI && <li className="flex gap-2"><Wand2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" /> Use Regenerate to fix a question's options/answer, or Extend explanation to enrich it — one at a time or all at once.</li>}
              {hasAI && <li className="flex gap-2"><Globe className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" /> Import from Web can read a PDF, document, web page or YouTube transcript.</li>}
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" /> Keep an eye on your account validity on the Dashboard and renew before it expires.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
