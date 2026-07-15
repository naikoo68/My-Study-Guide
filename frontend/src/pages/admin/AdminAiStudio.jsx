import { useEffect, useMemo, useState } from "react";
import { Sparkles, Wand2, Globe, ArrowRight } from "lucide-react";
import { practiceService, contentService, examService, testService } from "../../services";
import AiGenerate from "../../components/admin/AiGenerate";
import AiImport from "../../components/admin/AiImport";

// A standalone home for AI question generation / import. Pick a destination
// (like the Migration tool), then Generate or Import questions straight into it.
// Everything reuses the existing AI modals + the /questions/bulk save endpoint.
const DESTS = {
  myquiz: {
    label: "My Quiz",
    hint: "Practice quiz item",
    levels: [
      { key: "stream", label: "Stream…", load: () => practiceService.adminStreams("quiz") },
      { key: "subject", label: "Subject…", load: (v) => practiceService.adminSubjects(v) },
      { key: "topic", label: "Topic…", load: (v) => practiceService.adminTopics(v) },
      { key: "item", label: "Quiz…", load: (v) => practiceService.adminTopicItems(v) },
    ],
    leafKey: "item",
    target: (s) => ({ testSeries: s.item }),
  },
  mytest: {
    label: "My Test",
    hint: "Practice test item",
    levels: [
      { key: "stream", label: "Stream…", load: () => practiceService.adminStreams("test") },
      { key: "subject", label: "Subject…", load: (v) => practiceService.adminSubjects(v) },
      { key: "item", label: "Test…", load: (v) => practiceService.adminItems(v, "test") },
    ],
    leafKey: "item",
    target: (s) => ({ testSeries: s.item }),
  },
  content: {
    label: "Content Quiz",
    hint: "Platform quiz",
    levels: [
      { key: "stream", label: "Stream…", load: () => contentService.streams() },
      { key: "subject", label: "Subject…", load: (v) => contentService.subjectsByStream(v) },
      { key: "topic", label: "Topic…", load: (v) => contentService.topics(v), labelKey: "title" },
      { key: "session", label: "Session…", load: (v) => contentService.sessions(v), labelKey: "title" },
      { key: "quiz", label: "Quiz…", load: (v) => contentService.quizzes(v), labelKey: "title" },
    ],
    leafKey: "quiz",
    target: (s) => ({ subject: s.subject, session: s.session, quiz: s.quiz }),
  },
  testseries: {
    label: "Test Series",
    hint: "Platform test",
    levels: [
      { key: "exam", label: "Exam…", load: () => examService.exams() },
      { key: "post", label: "Post…", load: (v) => examService.posts(v) },
      { key: "test", label: "Test…", load: (v) => testService.adminList(v) },
    ],
    leafKey: "test",
    target: (s) => ({ testSeries: s.test }),
  },
};

// Cascading dropdowns; reports the full selection object up via onChange.
function Cascade({ levels, onChange }) {
  const [opts, setOpts] = useState([[]]);
  const [sel, setSel] = useState({});

  useEffect(() => {
    setSel({});
    setOpts([[]]);
    onChange?.({});
    levels[0].load().then((r) => setOpts([r || []])).catch(() => setOpts([[]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  const pick = (i, value) => {
    const next = {};
    for (let k = 0; k < i; k++) next[levels[k].key] = sel[levels[k].key];
    next[levels[i].key] = value;
    setSel(next);
    onChange?.(next);
    setOpts((o) => o.slice(0, i + 1));
    const nextLevel = levels[i + 1];
    if (value && nextLevel) {
      nextLevel.load(value).then((r) => setOpts((o) => { const c = o.slice(0, i + 1); c[i + 1] = r || []; return c; })).catch(() => {});
    }
  };

  return (
    <div className="space-y-2">
      {levels.map((lv, i) => (
        <select
          key={lv.key + i}
          value={sel[lv.key] || ""}
          disabled={i > 0 && !sel[levels[i - 1].key]}
          onChange={(e) => pick(i, e.target.value)}
          className="input"
        >
          <option value="">{lv.label}</option>
          {(opts[i] || []).map((o) => (
            <option key={o._id} value={o._id}>{o[lv.labelKey || "name"] || o.name || o.title}</option>
          ))}
        </select>
      ))}
    </div>
  );
}

export default function AdminAiStudio() {
  const [dest, setDest] = useState("myquiz");
  const [sel, setSel] = useState({});
  const [aiOpen, setAiOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [msg, setMsg] = useState("");

  const cfg = DESTS[dest];
  const leafId = sel[cfg.leafKey];
  const ready = Boolean(leafId);

  // Reset the picker + message whenever the destination type changes.
  useEffect(() => { setSel({}); setMsg(""); }, [dest]);

  // Save handler shared by both modals — writes to the chosen destination.
  const onUpload = async (questions) => {
    const res = await contentService.bulkQuestions(questions, cfg.target(sel));
    const n = res?.inserted ?? res?.count ?? (Array.isArray(questions) ? questions.length : 0);
    setMsg(`✓ Saved ${n} question${n === 1 ? "" : "s"} to the selected ${cfg.label}.`);
    return res;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Sparkles className="h-6 w-6 text-brand-600" /> AI Generator
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Turn content into quiz/test questions with AI: pick a <b>saved document</b>, upload a PDF, or paste text/a
          link — the AI reads it, writes questions with answers, and you insert them straight into the destination
          you choose below. Or generate fresh questions from a topic.
        </p>
      </div>

      {/* Destination type */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(DESTS).map(([key, d]) => (
          <button
            key={key}
            onClick={() => setDest(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              dest === key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="card p-6">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Destination — {cfg.label} <span className="font-normal normal-case text-slate-400">({cfg.hint})</span>
        </p>
        <div className="max-w-md">
          <Cascade key={dest} levels={cfg.levels} onChange={setSel} />
        </div>

        {msg && <p className="mt-4 text-sm font-medium text-emerald-600">{msg}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={() => { setMsg(""); setAiOpen(true); }} disabled={!ready} className="btn-primary disabled:opacity-50">
            <Wand2 className="h-4 w-4" /> Generate with AI
          </button>
          <button onClick={() => { setMsg(""); setImportOpen(true); }} disabled={!ready} className="btn-outline disabled:opacity-50">
            <Globe className="h-4 w-4" /> From Document / PDF / Web / Text
          </button>
          {!ready && <span className="flex items-center gap-1 text-sm text-slate-400"><ArrowRight className="h-4 w-4" /> pick a destination first</span>}
        </div>
      </div>

      <AiGenerate
        open={aiOpen}
        title={`Generate with AI — ${cfg.label}`}
        onClose={() => setAiOpen(false)}
        onUpload={onUpload}
      />
      <AiImport
        open={importOpen}
        documents
        title={`Questions from a source — ${cfg.label}`}
        onClose={() => setImportOpen(false)}
        onUpload={onUpload}
      />
    </div>
  );
}
