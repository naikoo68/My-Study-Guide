import { useEffect, useMemo, useState } from "react";
import { X, Wand2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { contentService, practiceService, testService } from "../../services";
import { QUESTION_TYPE_LABELS } from "../../lib/questions";

// Auto-build a test the EASY way. Pick one of the test's OWN predefined subjects
// (from its plan) — it never creates new subjects — then fill a GRID: rows are
// the test's topics (or the question types) and columns are difficulty
// (Easy / Medium / Hard / Any). Type a count in as many cells as you like — you
// can set, e.g. "MCQ Easy 5" AND "Matching Hard 3" AND "Topic X Medium 4" all at
// once. Questions are auto-picked from your existing quizzes and filed under the
// chosen subject.
//
// `plan`     = the test's subjectPlan [{ subject:<name>, count }].
// `practice` = build a "My Test" from the caller's own My Practice quizzes.
const DIFF_COLS = [
  { key: "Easy", label: "Easy" },
  { key: "Medium", label: "Med" },
  { key: "Hard", label: "Hard" },
  { key: "", label: "Any" }, // "" = any difficulty
];
const TYPE_KEYS = Object.keys(QUESTION_TYPE_LABELS);

export default function AutoBuildTest({ open, onClose, testId, testName = "", plan = [], practice = false, onDone }) {
  const [libSubjects, setLibSubjects] = useState([]);
  const [section, setSection] = useState("");
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [rowDim, setRowDim] = useState("topic"); // "topic" | "type" — what the grid rows are
  const [cells, setCells] = useState({}); // `${rowKey}|${diffKey}` -> count
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState(null);

  const OTHER = "__other__"; // the "any/other topic" row key

  useEffect(() => {
    if (!open) return;
    setSection(""); setTopics([]); setRowDim("topic"); setCells({}); setMsg(""); setReport(null);
    setLoading(true);
    const load = practice
      ? practiceService.allSubjects().then((s) => (s || []).filter((x) => (x.kind ? x.kind === "quiz" : true)))
      : contentService.subjects();
    load.then(setLibSubjects).catch(() => setLibSubjects([])).finally(() => setLoading(false));
  }, [open, practice]);

  const libByName = useMemo(() => {
    const m = {};
    for (const s of libSubjects) m[String(s.name || "").trim().toLowerCase()] = s;
    return m;
  }, [libSubjects]);

  const subjectOptions = useMemo(() => {
    if (Array.isArray(plan) && plan.length) {
      return plan.map((p) => String(p.subject || "").trim()).filter(Boolean)
        .map((name) => ({ name, planned: (plan.find((p) => (p.subject || "") === name) || {}).count || 0, lib: libByName[name.toLowerCase()] || null }));
    }
    return libSubjects.map((s) => ({ name: s.name, planned: 0, lib: s }));
  }, [plan, libSubjects, libByName]);

  const chosen = subjectOptions.find((o) => o.name === section) || null;
  const resolvedId = chosen?.lib?._id || "";

  useEffect(() => {
    if (!open || !resolvedId) { setTopics([]); return; }
    setTopicsLoading(true);
    setCells({});
    const load = practice ? practiceService.adminTopics(resolvedId) : contentService.topics(resolvedId);
    load.then((t) => setTopics(t || [])).catch(() => setTopics([])).finally(() => setTopicsLoading(false));
  }, [resolvedId, open, practice]);

  // Grid rows for the current dimension.
  const rows = useMemo(() => {
    if (rowDim === "type") return TYPE_KEYS.map((k) => ({ key: k, label: QUESTION_TYPE_LABELS[k] }));
    const t = topics.map((x) => ({ key: x._id, label: x.title || x.name }));
    t.push({ key: OTHER, label: "Any / other topic" });
    return t;
  }, [rowDim, topics]);

  const cellKey = (rowKey, diffKey) => `${rowKey}|${diffKey}`;
  const setCell = (rowKey, diffKey, v) => setCells((m) => ({ ...m, [cellKey(rowKey, diffKey)]: v }));
  const total = useMemo(() => Object.values(cells).reduce((s, n) => s + (parseInt(n, 10) || 0), 0), [cells]);

  if (!open) return null;

  const buildBlueprint = () => {
    const out = [];
    const base = (extra = {}) => (practice
      ? { practiceSubject: resolvedId, section, ...extra }
      : { subject: resolvedId, section, ...extra });
    for (const r of rows) {
      for (const c of DIFF_COLS) {
        const count = parseInt(cells[cellKey(r.key, c.key)], 10) || 0;
        if (count <= 0) continue;
        const extra = { difficulty: c.key || undefined, count };
        if (rowDim === "type") {
          extra.type = r.key;
        } else if (r.key !== OTHER) {
          if (practice) extra.practiceTopic = r.key; else extra.topic = r.key;
        }
        out.push(base(extra));
      }
    }
    return out;
  };

  const submit = async () => {
    if (!section) { setMsg("Choose a subject first."); return; }
    if (!resolvedId) { setMsg(`No matching quiz subject named "${section}" to pull from.`); return; }
    const blueprint = buildBlueprint();
    if (!blueprint.length) { setMsg("Type a count in at least one cell of the grid."); return; }
    setBusy(true); setMsg(""); setReport(null);
    try {
      const res = await testService.autoBuild(testId, blueprint);
      const n = res?.inserted ?? 0;
      setReport(res?.report || []);
      setMsg(n ? `\u2713 Added ${n} question(s) to "${section}".` : "No matching questions were found — try higher counts or 'Any'.");
      if (n) { onDone?.(n); setCells({}); }
    } catch (e) {
      setMsg(e.message || "Couldn't build the test.");
    } finally {
      setBusy(false);
    }
  };

  const noSubjects = !loading && subjectOptions.length === 0;

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Wand2 className="h-5 w-5 text-brand-600" /> Auto-build{testName ? ` \u2014 ${testName}` : ""}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Pick one of this test's <b>subjects</b>, then fill the grid: type how many questions you want for each <b>{rowDim === "type" ? "type" : "topic"}</b> and <b>difficulty</b> — set as many cells as you like at once. Questions are auto-picked from your quizzes and filed under that subject.
        </p>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        ) : noSubjects ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
            This test has no subjects defined yet. Add its subjects (subject plan) first.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-semibold">Subject {Array.isArray(plan) && plan.length ? "(from this test's plan)" : ""}</label>
              <select value={section} onChange={(e) => setSection(e.target.value)} className="input py-2 text-sm">
                <option value="">Choose a subject…</option>
                {subjectOptions.map((o) => (
                  <option key={o.name} value={o.name}>{o.name}{o.planned ? ` (plan: ${o.planned})` : ""}{!o.lib ? " — no matching quiz" : ""}</option>
                ))}
              </select>
              {section && !resolvedId && (
                <p className="mt-1 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  No quiz subject named "{section}" exists, so there's nothing to auto-pull.
                </p>
              )}
            </div>

            {section && resolvedId && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Rows:</span>
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold dark:border-slate-700">
                    <button type="button" onClick={() => { setRowDim("topic"); setCells({}); }} className={`px-3 py-1.5 ${rowDim === "topic" ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>By topic</button>
                    <button type="button" onClick={() => { setRowDim("type"); setCells({}); }} className={`px-3 py-1.5 ${rowDim === "type" ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>By type</button>
                  </div>
                  <span className="ml-auto text-xs text-slate-400">columns = difficulty</span>
                </div>

                {topicsLoading ? (
                  <div className="py-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-400" /></div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    {/* header */}
                    <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
                      <span className="min-w-0 flex-1">{rowDim === "type" ? "Question type" : "Topic"}</span>
                      {DIFF_COLS.map((c) => <span key={c.key} className="w-12 flex-shrink-0 text-center">{c.label}</span>)}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {rows.map((r) => (
                        <div key={r.key} className={`flex items-center gap-1 px-2 py-1 ${r.key === OTHER ? "border-t border-dashed border-slate-200 dark:border-slate-700" : ""}`}>
                          <span className={`min-w-0 flex-1 truncate text-xs ${r.key === OTHER ? "italic text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>{r.label}</span>
                          {DIFF_COLS.map((c) => (
                            <input
                              key={c.key}
                              type="number" min="0"
                              value={cells[cellKey(r.key, c.key)] || ""}
                              onChange={(e) => setCell(r.key, c.key, e.target.value)}
                              placeholder="0"
                              className="w-12 flex-shrink-0 rounded-md border border-slate-200 bg-white py-1 text-center text-xs outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900"
                            />
                          ))}
                        </div>
                      ))}
                      {rows.length === 0 && <p className="py-3 text-center text-xs text-slate-400">No topics — switch to "By type" or add topics.</p>}
                    </div>
                  </div>
                )}
                {total > 0 && <p className="text-xs text-slate-400">Total to add to {section}: <b>{total}</b> question(s).</p>}
              </>
            )}
          </div>
        )}

        {report && report.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
            <p className="mb-2 font-semibold text-slate-500 dark:text-slate-400">Result</p>
            <div className="space-y-1">
              {report.map((r, i) => {
                const label = [r.type ? (QUESTION_TYPE_LABELS[r.type] || r.type) : null, r.topic ? "topic" : null, r.difficulty || "Any"].filter(Boolean).join(" · ");
                const short = r.got < r.requested;
                return (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-600 dark:text-slate-300">{label}</span>
                    <span className={`flex-shrink-0 font-semibold ${short ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {r.got}/{r.requested}{short ? " (fewer in bank)" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {msg && (
          <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
            {msg.startsWith("\u2713") && <CheckCircle2 className="h-4 w-4 text-emerald-600" />} {msg}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
          <button type="button" onClick={submit} disabled={busy || loading || noSubjects || !section || !resolvedId || total <= 0} className="btn-primary">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Building…</> : <><Wand2 className="h-4 w-4" /> Build ({total})</>}
          </button>
        </div>
      </div>
    </div>
  );
}
