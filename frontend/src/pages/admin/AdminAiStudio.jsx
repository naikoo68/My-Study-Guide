import { useEffect, useState } from "react";
import { Sparkles, Wand2, Globe, ArrowRight, Layers } from "lucide-react";
import { practiceService, contentService, examService, testService } from "../../services";
import AiGenerate from "../../components/admin/AiGenerate";
import AiImport from "../../components/admin/AiImport";
import AiPdfTopics from "../../components/admin/AiPdfTopics";

// A standalone home for AI question generation / import. Pick a destination
// (like the Migration tool), then Generate or Import questions straight into it.
// Everything reuses the existing AI modals + the /questions/bulk save endpoint.
// Each destination also knows how to CREATE a new leaf (quiz/test) under the
// current parent selection, so a batch can be sent to a brand-new quiz/test
// instead of the currently selected one. createLeaf(sel, name) → new leaf _id.
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
    newLabel: "quiz",
    target: (s) => ({ testSeries: s.item }),
    createLeaf: async (s, name) =>
      (await practiceService.createItem({ name, practiceStream: s.stream, practiceSubject: s.subject, practiceTopic: s.topic, practiceKind: "quiz" }))?._id,
    // PDF → Topics support (needs a Subject selected). Creates a practice topic
    // per unit, then a quiz item under it.
    subjectKey: "subject",
    topicAdapter: {
      createTopic: async (s, name) => (await practiceService.createTopic({ subject: s.subject, name }))?._id,
      createQuizAndContext: async (s, topicId, name) => {
        const itemId = (await practiceService.createItem({ name, practiceStream: s.stream, practiceSubject: s.subject, practiceTopic: topicId, practiceKind: "quiz" }))?._id;
        return { testSeries: itemId };
      },
      bulk: (questions, context) => contentService.bulkQuestions(questions, context),
    },
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
    newLabel: "test",
    target: (s) => ({ testSeries: s.item }),
    createLeaf: async (s, name) =>
      (await practiceService.createItem({ name, practiceStream: s.stream, practiceSubject: s.subject, practiceKind: "test" }))?._id,
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
    newLabel: "quiz",
    target: (s) => ({ subject: s.subject, session: s.session, quiz: s.quiz }),
    createLeaf: async (s, name) =>
      (await contentService.createQuiz({ title: name, subject: s.subject, session: s.session }))?._id,
    // PDF → Topics support (needs a Subject selected). Creates a content topic
    // per unit, then a session + quiz under it.
    subjectKey: "subject",
    topicAdapter: {
      createTopic: async (s, name) => (await contentService.createTopic({ subject: s.subject, title: name }))?._id,
      createQuizAndContext: async (s, topicId, name) => {
        const sessionId = (await contentService.createSession({ subject: s.subject, topic: topicId, title: name }))?._id;
        const quizId = (await contentService.createQuiz({ subject: s.subject, session: sessionId, title: name }))?._id;
        return { subject: s.subject, session: sessionId, quiz: quizId };
      },
      bulk: (questions, context) => contentService.bulkQuestions(questions, context),
    },
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
    newLabel: "test",
    target: (s) => ({ testSeries: s.test }),
    createLeaf: async (s, name) =>
      (await testService.create({ name, exam: s.exam, post: s.post, category: "Full-Length", status: "published" }))?._id,
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
  const [pdfTopicsOpen, setPdfTopicsOpen] = useState(false);
  const [msg, setMsg] = useState("");

  const cfg = DESTS[dest];
  const leafId = sel[cfg.leafKey];
  const ready = Boolean(leafId);
  // PDF → Topics only needs a SUBJECT selected (it auto-creates the topics +
  // quizzes below it). Available on destinations that have a topic level.
  const subjectReady = cfg.topicAdapter && Boolean(sel[cfg.subjectKey]);
  // Name of the current destination leaf — shown in the modal as "current
  // quiz". Updated when a new quiz/test is auto-created for a batch.
  const [currentName, setCurrentName] = useState("");

  // Reset the picker + message whenever the destination type changes.
  useEffect(() => { setSel({}); setMsg(""); setCurrentName(""); }, [dest]);

  // Save handler shared by both modals — writes to the chosen destination.
  // opts.newTarget = { name } → create a NEW quiz/test under the current parent
  // and insert this batch there (used by the "new quiz" option on Generate more).
  const onUpload = async (questions, opts = {}) => {
    let selNow = sel;
    let createdName = "";
    if (opts.newTarget) {
      const name = String(opts.newTarget.name || "").trim();
      if (!name) throw new Error(`Enter a name for the new ${cfg.newLabel}.`);
      const newId = await cfg.createLeaf(sel, name);
      if (!newId) throw new Error(`Could not create the new ${cfg.newLabel}.`);
      selNow = { ...sel, [cfg.leafKey]: newId };
      setSel(selNow);        // subsequent batches now default to the new leaf
      setCurrentName(name);  // "current" now points at the just-created quiz/test
      createdName = name;
    }
    const res = await contentService.bulkQuestions(questions, cfg.target(selNow));
    const n = res?.inserted ?? res?.count ?? (Array.isArray(questions) ? questions.length : 0);
    setMsg(`✓ Saved ${n} question${n === 1 ? "" : "s"} to ${createdName ? `the new ${cfg.newLabel} “${createdName}”` : `the selected ${cfg.label}`}.`);
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
          <Cascade key={dest} levels={cfg.levels} onChange={(s) => { setSel(s); setCurrentName(""); }} />
        </div>

        {msg && <p className="mt-4 text-sm font-medium text-emerald-600">{msg}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={() => { setMsg(""); setAiOpen(true); }} disabled={!ready} className="btn-primary disabled:opacity-50">
            <Wand2 className="h-4 w-4" /> Generate with AI
          </button>
          <button onClick={() => { setMsg(""); setImportOpen(true); }} disabled={!ready} className="btn-outline disabled:opacity-50">
            <Globe className="h-4 w-4" /> From Document / PDF / Web / Text
          </button>
          {cfg.topicAdapter && (
            <button onClick={() => { setMsg(""); setPdfTopicsOpen(true); }} disabled={!subjectReady} className="btn-outline disabled:opacity-50" title="Upload a PDF → auto-create a topic per unit → generate & insert questions per topic">
              <Layers className="h-4 w-4" /> PDF → Topics (auto-split)
            </button>
          )}
          {!ready && !subjectReady && <span className="flex items-center gap-1 text-sm text-slate-400"><ArrowRight className="h-4 w-4" /> pick a destination first</span>}
        </div>
        {cfg.topicAdapter && subjectReady && !ready && (
          <p className="mt-2 text-xs text-slate-400">Tip: with just a <b>Subject</b> chosen, use <b>PDF → Topics</b> to auto-create a topic for each unit in your PDF and fill them with questions.</p>
        )}
      </div>

      <AiGenerate
        open={aiOpen}
        title={`Generate with AI — ${cfg.label}`}
        onClose={() => setAiOpen(false)}
        onUpload={onUpload}
        allowNewTarget
        newLeafLabel={cfg.newLabel}
        currentTargetName={currentName}
      />
      <AiImport
        open={importOpen}
        documents
        title={`Questions from a source — ${cfg.label}`}
        onClose={() => setImportOpen(false)}
        onUpload={onUpload}
        allowNewTarget
        newLeafLabel={cfg.newLabel}
        currentTargetName={currentName}
      />
      {cfg.topicAdapter && (
        <AiPdfTopics
          open={pdfTopicsOpen}
          onClose={() => setPdfTopicsOpen(false)}
          adapter={cfg.topicAdapter}
          sel={sel}
          subjectName={cfg.label}
          label={cfg.newLabel}
        />
      )}
    </div>
  );
}
