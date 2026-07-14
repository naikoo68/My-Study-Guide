import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2 } from "lucide-react";
import { searchService } from "../../services";

// Colour chip per result type.
const TYPE_STYLES = {
  Stream: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  Subject: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Topic: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Session: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  Quiz: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Test: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "My Quiz": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "My Test": "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
};

// Reusable metadata search box with a live results dropdown. Calls the
// role-aware /api/search endpoint. `mode` controls navigation targets:
//   • "public" → the public browse route (path)
//   • "admin"  → the matching admin screen (adminPath)
// The dropdown renders in a PORTAL with fixed positioning so it is never
// clipped by an ancestor's `overflow-hidden` (e.g. the landing-page hero) or
// hidden behind another stacking context.
export default function GlobalSearch({
  mode = "public",
  placeholder = "Search streams, subjects, topics, quizzes, tests…",
  className = "",
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [rect, setRect] = useState(null);
  const boxRef = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  // Position the portal dropdown right under the input box (viewport coords).
  const measure = useCallback(() => {
    if (!boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 6, width: r.width });
  }, []);

  // Debounced search (300ms). Needs at least 2 characters.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setErr("");
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchService
        .query(query)
        .then((r) => {
          setResults(r.results || []);
          setErr("");
        })
        .catch((e) => {
          setErr(e.message || "Search failed");
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click (ignore clicks inside the box or the portal panel).
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Keep the dropdown aligned while open (scroll / resize).
  useEffect(() => {
    if (!open) return;
    measure();
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, measure]);

  const go = (item) => {
    const path = mode === "admin" ? item.adminPath || item.path : item.path;
    setOpen(false);
    setQ("");
    setResults([]);
    if (path) navigate(path);
  };

  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            measure();
          }}
          onFocus={() => {
            setOpen(true);
            measure();
          }}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        {loading && <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-slate-400" />}
        {q && !loading && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setResults([]);
            }}
            title="Clear"
            className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showPanel &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 70 }}
            className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            {err ? (
              <p className="px-3 py-4 text-center text-sm text-rose-500">{err}</p>
            ) : loading && !results.length ? (
              <p className="px-3 py-4 text-center text-sm text-slate-500">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-500">No matches for “{q.trim()}”.</p>
            ) : (
              <>
                <p className="px-3 py-1 text-xs font-semibold text-slate-400">
                  {results.length} result{results.length === 1 ? "" : "s"}
                </p>
                {results.map((item) => (
                  <button
                    type="button"
                    key={`${item.type}-${item.id}`}
                    onClick={() => go(item)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <span
                      className={`flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                        TYPE_STYLES[item.type] || "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.title}</span>
                      {item.subtitle && (
                        <span className="block truncate text-xs text-slate-400">{item.subtitle}</span>
                      )}
                    </span>
                    {mode === "admin" && item.active === false && (
                      <span className="flex-shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                        Draft
                      </span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
