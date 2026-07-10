import { useEffect, useState } from "react";
import { X, Library, Loader2, CheckCircle2 } from "lucide-react";
import { contentService, practiceService, testService } from "../../services";
import MathText from "../ui/MathText";

const LETTERS = ["A", "B", "C", "D"];
const CONTENT_FIELDS = ["text", "type", "options", "correct", "difficulty", "explanation", "optionExplanations", "columnA", "columnB", "tableRows", "assertion", "reason", "image"];
const cleanQ = (q) => {
  const o = {};
  CONTENT_FIELDS.forEach((k) => q[k] !== undefined && (o[k] = q[k]));
  o.status = "published";
  return o;
};

// Manually pick questions from existing Quizzes / Practice and copy them into a
// test. Drill down with the selects, tick the questions you want (across
// multiple quizzes), then "Add to test".
export default function PickFromBank({ open, onClose, testId, title = "Add from Quizzes / Practice", onDone }) {
  const [tab, setTab] = useState("quiz"); // quiz | practice
  const [questions, setQuestions] = useState([]);
  const [loadingQ, setLoadingQ] = useState(false);
  const [chosen, setChosen] = useState({}); // _id -> question object (persists across drilling)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Quiz drill
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [sel, setSel] = useState({ subject: "", topic: "", session: "", quiz: "" });

  // Practice drill
  const [pKind, setPKind] = useState("quiz");
  const [pStreams, setPStreams] = useState([]);
  const [pSubjects, setPSubjects] = useState([]);
  const [pTopics, setPTopics] = useState([]);
  const [pItems, setPItems] = useState([]);
  const [pSel, setPSel] = useState({ stream: "", subject: "", topic: "", item: "" });

  useEffect(() => {
    if (!open) return;
    setTab("quiz");
    setChosen({});
    setQuestions([]);
    setMsg("");
    setSel({ subject: "", topic: "", session: "", quiz: "" });
    setPSel({ stream: "", subject: "", topic: "", item: "" });
    contentService.subjects().then(setSubjects).catch(() => setSubjects([]));
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "practice") return;
    practiceService.adminStreams(pKind).then(setPStreams).catch(() => setPStreams([]));
    setPSel({ stream: "", subject: "", topic: "", item: "" });
    setPSubjects([]); setPTopics([]); setPItems([]); setQuestions([]);
  }, [open, tab, pKind]);

  if (!open) return null;

  const loadQuizQuestions = (quizId) => {
    setLoadingQ(true);
    contentService.quizQuestions(quizId).then(setQuestions).catch(() => setQuestions([])).finally(() => setLoadingQ(false));
  };
  const loadItemQuestions = (itemId) => {
    setLoadingQ(true);
    testService.getQuestions(itemId).then(setQuestions).catch(() => setQuestions([])).finally(() => setLoadingQ(false));
  };

  const toggle = (q) =>
    setChosen((c) => {
      const n = { ...c };
      if (n[q._id]) delete n[q._id];
      else n[q._id] = q;
      return n;
    });
  const selectAllVisible = () =>
    setChosen((c) => {
      const n = { ...c };
      questions.forEach((q) => (n[q._id] = q));
      return n;
    });

  const chosenCount = Object.keys(chosen).length;

  const add = async () => {
    if (!chosenCount) { setMsg("Tick at least one question."); return; }
    setBusy(true);
    setMsg("");
    try {
      const payload = Object.values(chosen).map(cleanQ);
      const res = await contentService.bulkQuestions(payload, { testSeries: testId });
      setMsg(`✓ Added ${res?.inserted ?? payload.length} question(s) to the test.`);
      onDone?.(res?.inserted ?? payload.length);
      setTimeout(onClose, 900);
    } catch (e) {
      setMsg(e.message || "Couldn't add questions.");
    } finally {
      setBusy(false);
    }
  };

  const Select = ({ value, onChange, placeholder, options, labelKey = "name" }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input py-1.5 text-sm">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o._id} value={o._id}>{o[labelKey] || o.name || o.title}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Library className="h-5 w-5 text-brand-600" /> {title}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {/* Source tabs */}
        <div className="mb-3 flex gap-2">
          {["quiz", "practice"].map((t) => (
            <button key={t} onClick={() => { setTab(t); setQuestions([]); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === t ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
              {t === "quiz" ? "From Quizzes" : "From Practice"}
            </button>
          ))}
        </div>

        {/* Drill-down selects */}
        {tab === "quiz" ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Select value={sel.subject} placeholder="Subject…" options={subjects}
              onChange={(v) => { setSel({ subject: v, topic: "", session: "", quiz: "" }); setQuestions([]); setTopics([]); setSessions([]); setQuizzes([]); if (v) contentService.topics(v).then(setTopics); }} />
            <Select value={sel.topic} placeholder="Topic…" options={topics} labelKey="title"
              onChange={(v) => { setSel((s) => ({ ...s, topic: v, session: "", quiz: "" })); setQuestions([]); setSessions([]); setQuizzes([]); if (v) contentService.sessions(v).then(setSessions); }} />
            <Select value={sel.session} placeholder="Session…" options={sessions} labelKey="title"
              onChange={(v) => { setSel((s) => ({ ...s, session: v, quiz: "" })); setQuestions([]); setQuizzes([]); if (v) contentService.quizzes(v).then(setQuizzes); }} />
            <Select value={sel.quiz} placeholder="Quiz…" options={quizzes} labelKey="title"
              onChange={(v) => { setSel((s) => ({ ...s, quiz: v })); if (v) loadQuizQuestions(v); else setQuestions([]); }} />
          </div>
        ) : (
          <div className="mb-3 space-y-2">
            <div className="flex gap-2">
              {["quiz", "test"].map((k) => (
                <button key={k} onClick={() => setPKind(k)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${pKind === k ? "bg-accent-500 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                  {k === "quiz" ? "My Quiz" : "My Test Series"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={pSel.stream} placeholder="Stream…" options={pStreams}
                onChange={(v) => { setPSel({ stream: v, subject: "", topic: "", item: "" }); setQuestions([]); setPSubjects([]); setPTopics([]); setPItems([]); if (v) practiceService.adminSubjects(v).then(setPSubjects); }} />
              <Select value={pSel.subject} placeholder="Subject…" options={pSubjects}
                onChange={(v) => {
                  setPSel((s) => ({ ...s, subject: v, topic: "", item: "" })); setQuestions([]); setPTopics([]); setPItems([]);
                  if (v) { if (pKind === "quiz") practiceService.adminTopics(v).then(setPTopics); else practiceService.adminItems(v, "test").then(setPItems); }
                }} />
              {pKind === "quiz" && (
                <Select value={pSel.topic} placeholder="Topic…" options={pTopics}
                  onChange={(v) => { setPSel((s) => ({ ...s, topic: v, item: "" })); setQuestions([]); setPItems([]); if (v) practiceService.adminTopicItems(v).then(setPItems); }} />
              )}
              <Select value={pSel.item} placeholder="Quiz / Test…" options={pItems}
                onChange={(v) => { setPSel((s) => ({ ...s, item: v })); if (v) loadItemQuestions(v); else setQuestions([]); }} />
            </div>
          </div>
        )}

        {/* Questions with checkboxes */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
            <span className="font-semibold text-slate-500">{questions.length} question(s) here</span>
            {questions.length > 0 && <button onClick={selectAllVisible} className="font-semibold text-brand-600 hover:underline">Select all here</button>}
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto p-2">
            {loadingQ ? (
              <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
            ) : questions.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Pick a {tab === "quiz" ? "quiz" : "item"} above to see its questions.</p>
            ) : (
              questions.map((q) => (
                <label key={q._id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
                  <input type="checkbox" checked={!!chosen[q._id]} onChange={() => toggle(q)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200"><MathText>{q.text}</MathText></span>
                    <span className="ml-2 text-slate-400">{q.type} · {q.difficulty} · Ans {LETTERS[q.correct] ?? "?"}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            {chosenCount > 0 && <><CheckCircle2 className="h-4 w-4" /> {chosenCount} selected</>}
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-outline">Close</button>
            <button type="button" onClick={add} disabled={busy || !chosenCount} className="btn-primary">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : `Add ${chosenCount || ""} to Test`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
