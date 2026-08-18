import { useEffect, useMemo, useState } from "react";
import { X, Wand2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { contentService, practiceService, testService } from "../../services";
import { QUESTION_TYPE_LABELS } from "../../lib/questions";

// Auto-build a test the EASY way. You pick one of the test's OWN predefined
// subjects (from its subject plan) — it does NOT create new subjects — then just
// type HOW MANY questions you want, either per TOPIC (auto-listed) or per TYPE.
// A single Difficulty (and, in topic mode, a single Type) filter applies to the
// whole pull. Questions are auto-selected from your existing quizzes and filed
// under that predefined subject.
//
// `plan`     = the test's subjectPlan [{ subject: <name>, count }] — the fixed
//              subjects to fill. If empty, we fall back to the whole quiz-bank
//              subject list (a test with no predefined plan).
// `practice` = build a "My Test" from the caller's own My Practice quizzes.
const DIFFS = ["Easy", "Medium", "Hard"];
const TYPE_KEYS = Object.keys(QUESTION_TYPE_LABELS);

export default function AutoBuildTest({ open, onClose, testId, testName = "", plan = [], practice = false, onDone }) {
  const [libSubjects, setLibSubjects] = useState([]); // quiz-bank subjects (for name→id + topics)
  const [section, setSection] = useState(""); // the CHOSEN predefined subject NAME
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  const [splitBy, setSplitBy] = useState("topic"); // "topic" | "type"
  const [difficulty, setDifficulty] = useState("");
  const [type, setType] = useState("");

  const [topicCounts, setTopicCounts] = useState({});
  const [otherTopicCount, setOtherTopicCount] = useState(0);
  const [typeCounts, setTypeCounts] = useState({});

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSection(""); setTopics([]); setSplitBy("topic"); setDifficulty(""); setType("");
    setTopicCounts({}); setOtherTopicCount(0); setTypeCounts({}); setMsg(""); setReport(null);
    setLoading(true);
    const load = practice
      ? practiceService.allSubjects().then((s) => (s || []).filter((x) => (x.kind ? x.kind === "quiz" : true)))
      : contentService.subjects();
    load.then(setLibSubjects).catch(() => setLibSubjects([])).finally(() => setLoading(false));
  }, [open, practice]);

  // Map a quiz-bank subject NAME (case-insensitive) → its record (for id + topics).
  const libByName = useMemo(() => {
    const m = {};
    for (const s of libSubjects) m[String(s.name || "").trim().toLowerCase()] = s;
    return m;
  }, [libSubjects]);

  // The subjects to offer: the test's predefined plan subjects when it has them,
  // otherwise the whole quiz-bank subject list.
  const subjectOptions = useMemo(() => {
    if (Array.isArray(plan) && plan.length) {
      return plan
        .map((p) => String(p.subject || "").trim())
        .filter(Boolean)
        .map((name) => ({ name, planned: (plan.find((p) => (p.subject || "") === name) || {}).count || 0, lib: libByName[name.toLowerCase()] || null }));
    }
    return libSubjects.map((s) => ({ name: s.name, planned: 0, lib: s }));
  }, [plan, libSubjects, libByName]);

  const chosen = subjectOptions.find((o) => o.name === section) || null;
  const resolvedId = chosen?.lib?._id || ""; // the quiz-bank subject to pull FROM

  // Load the chosen subject's topics (from its matching quiz-bank subject).
  useEffect(() => {
    if (!open || !resolvedId) { setTopics([]); return; }
    setTopicsLoading(true);
    setTopicCounts({}); setOtherTopicCount(0);
    const load = practice ? practiceService.adminTopics(resolvedId) : contentService.topics(resolvedId);
    load.then((t) => setTopics(t || [])).catch(() => setTopics([])).finally(() => setTopicsLoading(false));
  }, [resolvedId, open, practice]);

  const total = useMemo(() => {
    if (splitBy === "topic") return Object.values(topicCounts).reduce((s, n) => s + (parseInt(n, 10) || 0), 0) + (parseInt(otherTopicCount, 10) || 0);
    return Object.values(typeCounts).reduce((s, n) => s + (parseInt(n, 10) || 0), 0);
  }, [splitBy, topicCounts, otherTopicCount, typeCounts]);

  if (!open) return null;

  const buildBlueprint = () => {
    const rows = [];
    // Always file questions under the chosen PREDEFINED subject name (section),
    // and pull them from that subject's matching quiz-bank subject (resolvedId).
    const base = (extra = {}) => (practice
      ? { practiceSubject: resolvedId, section, ...extra }
      : { subject: resolvedId, section, ...extra });

    if (splitBy === "topic") {
      for (const t of topics) {
        const count = parseInt(topicCounts[t._id], 10) || 0;
        if (count <= 0) continue;
        rows.push(base({ ...(practice ? { practiceTopic: t._id } : { topic: t._id }), type: type || undefined, difficulty: difficulty || undefined, count }));
      }
      const other = parseInt(otherTopicCount, 10) || 0;
      if (other > 0) rows.push(base({ type: type || undefined, difficulty: difficulty || undefined, count: other }));
    } else {
      for (const k of TYPE_KEYS) {
        const count = parseInt(typeCounts[k], 10) || 0;
        if (count <= 0) continue;
        rows.push(base({ type: k, difficulty: difficulty || undefined, count }));
      }
    }
    return rows;
  };

  const submit = async () => {
    if (!section) { setMsg("Choose a subject first."); return; }
    if (!resolvedId) { setMsg(`No matching quiz subject named "${section}" to pull questions from. Build a quiz under that subject first.`); return; }
    const blueprint = buildBlueprint();
    if (!blueprint.length) { setMsg("Enter how many questions you want (per topic or per type)."); return; }
    setBusy(true); setMsg(""); setReport(null);
    try {
      const res = await testService.autoBuild(testId, blueprint);
      const n = res?.inserted ?? 0;
      setReport(res?.report || []);
      setMsg(n ? `\u2713 Added ${n} question(s) to "${section}".` : "No matching questions were found — try higher counts, a different topic/type, or 'Any' difficulty.");
      if (n) {
        onDone?.(n);
        setTopicCounts({}); setOtherTopicCount(0); setTypeCounts({}); // ready for the next subject
      }
    } catch (e) {
      setMsg(e.message || "Couldn't build the test.");
    } finally {
      setBusy(false);
    }
  };

  const noSubjects = !loading && subjectOptions.length === 0;
  const countInput = (value, onChange) => (
    <input type="number" min="0" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="0" className="input w-20 py-1.5 text-center text-sm" />
  );

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
          Choose one of this test's <b>subjects</b>, then type how many questions you want — per <b>topic</b> or per <b>type</b>. Questions are auto-picked from your existing quizzes and filed under that subject. Do one subject, then pick another and build again.
        </p>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        ) : noSubjects ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
            This test has no subjects defined yet. Add its subjects (subject plan) first, then come back.
          </p>
        ) : (
          <div className="space-y-4">
            {/* 1. One of the test's PREDEFINED subjects */}
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
                  No quiz subject named "{section}" exists, so there's nothing to auto-pull. Create a quiz under that subject, or hand-pick instead.
                </p>
              )}
            </div>

            {section && resolvedId && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">How many by:</span>
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold dark:border-slate-700">
                    <button type="button" onClick={() => setSplitBy("topic")} className={`px-3 py-1.5 ${splitBy === "topic" ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Topic</button>
                    <button type="button" onClick={() => setSplitBy("type")} className={`px-3 py-1.5 ${splitBy === "type" ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Question type</button>
                  </div>
                  <span className="ml-auto flex items-center gap-1 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Difficulty</span>
                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="input py-1 text-sm">
                      <option value="">Any</option>
                      {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </span>
                </div>

                {splitBy === "topic" && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Question type</span>
                    <select value={type} onChange={(e) => setType(e.target.value)} className="input py-1 text-sm">
                      <option value="">Any type</option>
                      {TYPE_KEYS.map((k) => <option key={k} value={k}>{QUESTION_TYPE_LABELS[k]}</option>)}
                    </select>
                  </div>
                )}

                {splitBy === "topic" ? (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400"><span>Topic</span><span>Questions</span></div>
                    {topicsLoading ? (
                      <div className="py-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-400" /></div>
                    ) : (
                      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                        {topics.map((t) => (
                          <div key={t._id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800/60">
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{t.title || t.name}</span>
                            {countInput(topicCounts[t._id], (v) => setTopicCounts((m) => ({ ...m, [t._id]: v })))}
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-1.5 dark:border-slate-700">
                          <span className="min-w-0 flex-1 truncate text-sm italic text-slate-500 dark:text-slate-400">Any / other (whole subject)</span>
                          {countInput(otherTopicCount, setOtherTopicCount)}
                        </div>
                        {topics.length === 0 && <p className="py-2 text-center text-xs text-slate-400">This subject has no topics — use the "Any / other" row.</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400"><span>Question type</span><span>Questions</span></div>
                    <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {TYPE_KEYS.map((k) => (
                        <div key={k} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800/60">
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{QUESTION_TYPE_LABELS[k]}</span>
                          {countInput(typeCounts[k], (v) => setTypeCounts((m) => ({ ...m, [k]: v })))}
                        </div>
                      ))}
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
                const label = [r.type ? (QUESTION_TYPE_LABELS[r.type] || r.type) : null, r.topic ? "topic" : null, r.difficulty || null].filter(Boolean).join(" · ") || r.subject;
                const short = r.got < r.requested;
                return (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-600 dark:text-slate-300">{label}</span>
                    <span className={`flex-shrink-0 font-semibold ${short ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {r.got}/{r.requested}{short ? " (bank had fewer)" : ""}
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
