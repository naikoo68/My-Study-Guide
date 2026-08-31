import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Sparkles, ScanSearch, CheckCircle2 } from "lucide-react";

// Gradient palette (mirrors AdminContent's COLORS) so freshly-added subjects/
// topics get the same colourful treatment as manually-created ones.
const COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-teal-600",
];

// Normalise a name for duplicate detection: lower-cased, trimmed, whitespace
// collapsed. Used to diff AI suggestions against what already exists.
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * "Search Missing Subjects/Topics" — the sibling of "Scan Missing Areas" but a
 * level up. It asks the AI which subjects belong under this stream (or which
 * topics make up this subject), removes the ones you already have, and lets you
 * tick the rest and add them all at once.
 *
 * Props:
 *  - level: "subject" | "topic" (drives all wording + the icon default)
 *  - parentName: the stream name (for subjects) or subject name (for topics)
 *  - parentKind: "stream" | "subject" (what the parent is called)
 *  - existing: string[] of names/titles already present (to subtract)
 *  - fetchSuggestions: () => Promise<Array<{name?,title?,description?}>>
 *  - onAdd: (picked) => Promise<void>   picked = [{name,description,icon,color}]
 *  - bulkProgress: { added, total } | null   live "Added X of Y" counter
 *  - onClose: () => void
 */
export default function MissingItemsModal({ level, parentName, parentKind, existing = [], fetchSuggestions, onAdd, bulkProgress, onClose }) {
  const isTopic = level === "topic";
  const noun = isTopic ? "topic" : "subject";
  const nounPlural = isTopic ? "topics" : "subjects";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [suggestions, setSuggestions] = useState([]); // AI list, normalised to {name,...}
  const [picked, setPicked] = useState(() => new Set()); // names selected to add
  const [query, setQuery] = useState("");

  // Set of names that already exist, for fast diffing.
  const existingSet = useMemo(() => new Set((existing || []).map(norm)), [existing]);

  // Ask the AI, then drop anything we already have.
  const run = () => {
    setLoading(true);
    setErr("");
    Promise.resolve(fetchSuggestions())
      .then((list) => {
        const mapped = (list || [])
          .map((s, i) => ({
            name: s.name || s.title || "",
            description: s.description || "",
            icon: isTopic ? "ListChecks" : "BookOpen",
            color: COLORS[i % COLORS.length],
          }))
          .filter((s) => s.name && !existingSet.has(norm(s.name)));
        // De-dupe the AI list against itself too.
        const seen = new Set();
        const unique = mapped.filter((s) => {
          const k = norm(s.name);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setSuggestions(unique);
        setPicked(new Set(unique.map((s) => s.name))); // default: everything ticked
      })
      .catch((e) => setErr(e?.message || `Couldn't search for missing ${nounPlural}.`))
      .finally(() => setLoading(false));
  };

  // Run once on open.
  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const q = query.trim().toLowerCase();
  const shown = q ? suggestions.filter((s) => s.name.toLowerCase().includes(q)) : suggestions;
  const allShownPicked = shown.length > 0 && shown.every((s) => picked.has(s.name));

  const toggle = (name) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const toggleAllShown = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) shown.forEach((s) => next.delete(s.name));
      else shown.forEach((s) => next.add(s.name));
      return next;
    });

  const submit = () => {
    const list = suggestions.filter((s) => picked.has(s.name));
    if (list.length) onAdd(list);
  };

  const parentLabel = parentName || `this ${parentKind}`;
  const busy = !!bulkProgress;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <ScanSearch className="h-5 w-5 text-brand-600" /> Missing {nounPlural}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          AI-suggested {nounPlural} for <span className="font-semibold">“{parentLabel}”</span> that you don’t have yet. Tick the ones you want and add them all at once.
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Searching for missing {nounPlural}…
          </div>
        ) : err ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm font-medium text-rose-600">{err}</p>
            <button type="button" onClick={run} className="btn-outline mx-auto"><Sparkles className="h-4 w-4" /> Try again</button>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="space-y-3 py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="text-sm text-slate-500">
              No missing {nounPlural} found — you already have everything the AI suggested for “{parentLabel}”.
            </p>
            <button type="button" onClick={run} className="btn-outline mx-auto"><ScanSearch className="h-4 w-4" /> Search again</button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{suggestions.length} missing {suggestions.length === 1 ? noun : nounPlural} found</span>
              {busy ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <Loader2 className="h-3 w-3 animate-spin" /> Added {bulkProgress.added} of {bulkProgress.total}
                </span>
              ) : picked.size > 0 ? (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{picked.size} selected</span>
              ) : null}
            </div>
            {suggestions.length > 8 && (
              <input
                className="input mb-2"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${nounPlural}…`}
              />
            )}
            <label className="mb-1 flex cursor-pointer items-center gap-2 border-b border-slate-100 pb-2 text-sm font-medium dark:border-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={allShownPicked} onChange={toggleAllShown} />
              Select all{query ? " matching" : ""} ({shown.length})
            </label>
            <div className="max-h-72 space-y-0.5 overflow-y-auto py-1">
              {shown.map((s) => (
                <label key={s.name} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300" checked={picked.has(s.name)} onChange={() => toggle(s.name)} />
                  <span className={`mt-0.5 h-5 w-5 flex-shrink-0 rounded-md bg-gradient-to-br ${s.color}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.name}</span>
                    {s.description && <span className="block text-xs text-slate-400">{s.description}</span>}
                  </span>
                </label>
              ))}
              {shown.length === 0 && <p className="py-2 text-sm text-slate-400">No {nounPlural} match “{query}”.</p>}
            </div>
          </>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
          {suggestions.length > 0 && (
            <button type="button" disabled={busy || picked.size === 0} className="btn-primary" onClick={submit}>
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Added {bulkProgress.added} of {bulkProgress.total} {noun}{bulkProgress.total === 1 ? "" : "s"}…</>
              ) : (
                `Add ${picked.size} ${picked.size === 1 ? noun : nounPlural}`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
