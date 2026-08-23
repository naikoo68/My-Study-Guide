import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Globe, CheckCircle2, Download, Send, ChevronLeft, Puzzle, Loader2, History, ListChecks, FileText, Layers, Lightbulb, Play } from "lucide-react";
import { companionService } from "../services";

const TYPE_META = {
  quiz: { Icon: ListChecks, label: "Quiz" },
  questions: { Icon: ListChecks, label: "Questions" },
  summary: { Icon: FileText, label: "Summary" },
  flashcards: { Icon: Layers, label: "Flashcards" },
  explain: { Icon: Lightbulb, label: "Explanation" },
};

function timeAgo(d) {
  const t = new Date(d).getTime();
  if (!t) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
}

// Connections — the in-app home for the "My Study Guide Companion" browser
// extension. The extension turns permitted study content on other learning
// platforms into practice material using the EXISTING AI system. This page does
// NOT do any AI itself — it explains the Companion, shows connection status,
// lists supported platforms, and lets users request a new platform.
export default function Connections({ embedded = false }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInstall, setShowInstall] = useState(false);

  const [req, setReq] = useState({ platform: "", website: "", feature: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");

  const [history, setHistory] = useState(null);

  useEffect(() => {
    companionService.status().then(setStatus).catch(() => setStatus(null)).finally(() => setLoading(false));
    companionService.history().then((r) => setHistory(r.items || [])).catch(() => setHistory([]));
  }, []);

  const submitRequest = async (e) => {
    e.preventDefault();
    if (!req.platform.trim() && !req.website.trim()) return;
    setSending(true);
    setSent("");
    try {
      const r = await companionService.platformRequest(req);
      setSent(r.message || "Thanks! Your request was sent.");
      setReq({ platform: "", website: "", feature: "" });
    } catch (e2) {
      setSent(e2.message || "Could not send the request.");
    } finally {
      setSending(false);
    }
  };

  const platforms = status?.platforms || [
    { id: "youtube", name: "YouTube", auto: true },
    { id: "pw", name: "Physics Wallah (PW)", auto: false },
    { id: "unacademy", name: "Unacademy", auto: false },
    { id: "udemy", name: "Udemy", auto: false },
    { id: "coursera", name: "Coursera", auto: false },
    { id: "generic", name: "Any website (selected text)", auto: true },
  ];

  return (
    <div className={embedded ? "" : "container-page py-10"}>
      {!embedded && (
        <Link to="/account" className="btn-ghost -ml-2 mb-6 w-fit">
          <ChevronLeft className="h-4 w-4" /> Back to account
        </Link>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Connections</h1>
        <p className="text-slate-500 dark:text-slate-400">Use My Study Guide while studying on your favourite learning platforms.</p>
      </div>

      {/* Companion card */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-soft">
            <Sparkles className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-bold">My Study Guide Companion</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              A browser extension that turns the study content you're allowed to see — lecture text, captions and selected text —
              into questions, quizzes, summaries, flashcards and notes, using your existing My Study Guide AI.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {loading ? (
                <span className="inline-flex items-center gap-1.5 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</span>
              ) : status?.aiAccess ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> AI access enabled{status?.plan ? ` · ${status.plan}` : ""}</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">AI access not enabled on this account</span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="/companion-extension.zip"
                download="companion-extension.zip"
                onClick={() => setShowInstall(true)}
                className="btn-primary"
              >
                <Download className="h-4 w-4" /> Download Companion
              </a>
              <button onClick={() => setShowInstall((s) => !s)} className="btn-ghost">
                How to install
              </button>
            </div>
          </div>
        </div>

        {showInstall && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            <p className="flex items-center gap-2 font-semibold"><Puzzle className="h-4 w-4 text-brand-600" /> Install the extension (developer / unpacked)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              <li>Click <b>Download Companion</b> above to save <code>companion-extension.zip</code>, then unzip it. <span className="text-slate-400">(Use a computer — browser extensions don't install on phones.)</span></li>
              <li>Open your browser's Extensions page (in Chrome/Brave/Edge, go to <code>chrome://extensions</code>) and turn on <b>Developer mode</b>.</li>
              <li>Click <b>Load unpacked</b> and select the unzipped folder.</li>
              <li>Open the Companion, click <b>Sign in</b>, and log in with this My Study Guide account.</li>
            </ol>
            <p className="mt-2 text-xs text-slate-400">A one-click store listing will be added later; for now it installs as an unpacked extension.</p>
          </div>
        )}
      </div>

      {/* Supported platforms */}
      <div className="card mt-5 p-6">
        <h3 className="font-bold">Supported platforms</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          The connection is between the browser extension and My Study Guide — you stay logged in to each platform on its own site.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {platforms.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              <span className="font-medium">{p.name}</span>
              <span className="ml-auto text-xs text-slate-400">{p.auto ? "Auto-detect" : "Selected text"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Companion history */}
      {history && history.length > 0 && (
        <div className="card mt-5 p-6">
          <h3 className="flex items-center gap-2 font-bold"><History className="h-5 w-5 text-brand-600" /> Companion history</h3>
          <div className="mt-4 space-y-2">
            {history.map((h) => {
              const M = TYPE_META[h.type] || TYPE_META.summary;
              return (
                <div key={h._id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <M.Icon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{h.title || M.label}</p>
                    <p className="text-xs text-slate-400">{[M.label, h.platform, h.count ? `${h.count} item(s)` : ""].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-slate-400">{timeAgo(h.createdAt)}</span>
                  {h.type === "quiz" && h.itemId && (
                    <Link to={`/practice/quiz/play/${h.itemId}`} title="Open quiz" className="flex-shrink-0 text-brand-600 hover:text-brand-700"><Play className="h-4 w-4" /></Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Request a platform */}
      <div className="card mt-5 p-6">
        <h3 className="flex items-center gap-2 font-bold"><Globe className="h-5 w-5 text-brand-600" /> Don't see your learning platform?</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tell us and we'll consider adding support.</p>
        <form onSubmit={submitRequest} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input className="input" placeholder="Platform name (e.g. Toppr)" value={req.platform} onChange={(e) => setReq({ ...req, platform: e.target.value })} />
          <input className="input" placeholder="Website (https://…)" value={req.website} onChange={(e) => setReq({ ...req, website: e.target.value })} />
          <textarea className="input resize-none sm:col-span-2" rows={2} placeholder="What would you like it to do? (optional)" value={req.feature} onChange={(e) => setReq({ ...req, feature: e.target.value })} />
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={sending} className="btn-primary">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Request a platform
            </button>
            {sent && <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{sent}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
