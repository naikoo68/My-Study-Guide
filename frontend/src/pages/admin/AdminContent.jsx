import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X, ChevronRight, FolderOpen, Layers, BookOpen, HelpCircle, ListChecks, Upload, Eye, Copy, Download, GraduationCap, Search, Clock } from "lucide-react";
import { contentService, aiService } from "../../services";
import { loadNav, saveNav } from "../../lib/navState";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import BulkUploadQuestions, { questionsToCsv } from "../../components/admin/BulkUploadQuestions";
import AiGenerate from "../../components/admin/AiGenerate";
import QuestionFormModal from "../../components/admin/QuestionFormModal";
import QuestionView from "../../components/admin/QuestionView";
import AddToTestModal from "../../components/admin/AddToTestModal";
import { questionDateText, searchQuestions } from "../../lib/questions";
import DuplicatesModal from "../../components/admin/DuplicatesModal";
import AiImport from "../../components/admin/AiImport";
import ExtendExplanationsModal from "../../components/admin/ExtendExplanationsModal";
import ExtendOneQuestionModal from "../../components/admin/ExtendOneQuestionModal";
import RegenerateAllModal from "../../components/admin/RegenerateAllModal";
import ScheduleQuestionModal from "../../components/admin/ScheduleQuestionModal";
import { Sparkles, Files, Globe, Wand2, Loader2, ClipboardList, RefreshCw } from "lucide-react";

const COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-teal-600",
];

// Singular type name for each drill-down level (used by the form modal).
const VIEW_TYPE = { streams: "stream", subjects: "subject", topics: "topic", sessions: "session", quizzes: "quiz", questions: "question" };



const NAV_KEY = "mpm-admin-content-nav"; // remembers drill-down position across refreshes

export default function AdminContent() {
  // Drill-down context — restored from sessionStorage so a refresh keeps you
  // exactly where you were (e.g. inside a topic), instead of jumping to Streams.
  const [view, setView] = useState(() => loadNav(NAV_KEY).view || "streams"); // streams | subjects | topics | sessions | quizzes | questions
  const [stream, setStream] = useState(() => loadNav(NAV_KEY).stream || null);
  const [subject, setSubject] = useState(() => loadNav(NAV_KEY).subject || null);
  const [topic, setTopic] = useState(() => loadNav(NAV_KEY).topic || null);
  const [session, setSession] = useState(() => loadNav(NAV_KEY).session || null);
  const [quiz, setQuiz] = useState(() => loadNav(NAV_KEY).quiz || null);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { type, mode, data }
  const [bulkOpen, setBulkOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState(null); // {id,title} — after AI creates a new quiz, later batches target it
  const [extendOpen, setExtendOpen] = useState(false); // AI extend-explanations (whole quiz)
  const [regenAllOpen, setRegenAllOpen] = useState(false); // AI regenerate-all (whole quiz)
  const [scheduleQ, setScheduleQ] = useState(null); // question to post/schedule to Facebook
  const [extendingQId, setExtendingQId] = useState(null); // per-question extend in progress
  const [extendOneItem, setExtendOneItem] = useState(null); // per-question extend confirm modal target
  const [regenId, setRegenId] = useState(null); // per-question regenerate in progress
  const [dupOpen, setDupOpen] = useState(false);
  const [dupScope, setDupScope] = useState({ id: "all", name: "" }); // which subject the duplicate scan targets
  const [saving, setSaving] = useState(false);
  const [viewQ, setViewQ] = useState(null); // single question to preview
  const [addToTestQ, setAddToTestQ] = useState(null); // question being copied into a test
  const [viewAll, setViewAll] = useState(false); // preview all questions
  const [studentView, setStudentView] = useState(true); // View All: defaults to student view (answers hidden)
  const [selected, setSelected] = useState([]); // bulk-selected question ids
  const [search, setSearch] = useState(""); // question search query

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = view === "questions" && items.length > 0 && selected.length === items.length;
  const toggleAll = () => setSelected(allSelected ? [] : items.map((i) => i._id));
  const deleteSelected = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Delete ${selected.length} selected question(s)? This cannot be undone.`)) return;
    try {
      for (const id of selected) await contentService.deleteQuestion(id);
      setSelected([]);
      load("questions");
    } catch (e) {
      setError(e.message);
    }
  };

  // Regenerate ONE question: AI analyses the stem and rebuilds its options/
  // answer/explanations to fit, then refresh the list (and the open preview).
  const regenerateQ = async (item) => {
    setRegenId(item._id);
    try {
      const updated = await aiService.regenerate({ questionId: item._id });
      // If this question is open in the preview modal, reflect the fix live.
      setViewQ((prev) => (prev && prev._id === item._id ? { ...prev, ...updated } : prev));
      await load("questions");
    } catch (e) {
      setError(e.message);
    } finally {
      setRegenId(null);
    }
  };

  // Extend ONE question's explanation with AI — open the confirm modal first.
  const extendOneQuestion = (item) => setExtendOneItem(item);

  // Run the actual extend once the user confirms in the modal.
  const runExtendOne = async (fixOptions) => {
    const item = extendOneItem;
    if (!item) return;
    setExtendingQId(item._id);
    try {
      const updated = await aiService.extendOne({ questionId: item._id, fixOptions });
      // If this question is open in the preview modal, reflect the change live.
      setViewQ((prev) => (prev && prev._id === item._id ? { ...prev, ...updated } : prev));
      setExtendOneItem(null);
      load("questions");
    } catch (e) {
      setError(e.message);
      setExtendOneItem(null);
    } finally {
      setExtendingQId(null);
    }
  };

  const loaders = {
    streams: () => contentService.streams(),
    subjects: () => contentService.subjectsByStream(stream._id),
    topics: () => contentService.topics(subject._id),
    sessions: () => contentService.sessions(topic._id),
    quizzes: () => contentService.quizzes(session._id),
    questions: () => contentService.quizQuestions(quiz._id),
  };

  const load = useCallback((which) => {
    setLoading(true);
    setError("");
    loaders[which]()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, subject, topic, session, quiz]);

  useEffect(() => { setSelected([]); setSearch(""); load(view); /* eslint-disable-next-line */ }, [view]);

  // Save an AI-generated / imported batch. When opts.newTarget = { name } is set
  // (the "New quiz" option in the modal) we CREATE a new quiz under the current
  // session and insert the batch there; later batches then default to that new
  // quiz. Otherwise the batch goes into the quiz currently open.
  const saveAiBatch = async (questions, opts = {}) => {
    let quizId = aiTarget?.id || quiz?._id;
    if (opts.newTarget) {
      const title = String(opts.newTarget.name || "").trim();
      if (!title) throw new Error("Enter a name for the new quiz.");
      const created = await contentService.createQuiz({ title, subject: subject._id, session: session._id });
      if (!created?._id) throw new Error("Could not create the new quiz.");
      quizId = created._id;
      setAiTarget({ id: quizId, title }); // subsequent batches target the new quiz
    }
    const res = await contentService.bulkQuestions(questions, {
      subject: subject._id,
      session: session._id,
      quiz: quizId,
    });
    if (quizId === quiz?._id) load("questions"); // refresh only when writing to the open quiz
    return res;
  };

  // Remember the current drill-down position so a page refresh restores it.
  useEffect(() => {
    saveNav(NAV_KEY, { view, stream, subject, topic, session, quiz });
  }, [view, stream, subject, topic, session, quiz]);

  // Navigation
  const openStream = (s) => { setStream(s); setSubject(null); setTopic(null); setSession(null); setQuiz(null); setView("subjects"); };
  const openSubject = (s) => { setSubject(s); setTopic(null); setSession(null); setQuiz(null); setView("topics"); };
  const openTopic = (t) => { setTopic(t); setSession(null); setQuiz(null); setView("sessions"); };
  const openSession = (s) => { setSession(s); setQuiz(null); setView("quizzes"); };
  const openQuiz = (q) => { setQuiz(q); setView("questions"); };
  const goTo = (level) => setView(level);

  // Open the right level for the current view (used for whole-card tapping).
  const openItem = (item) =>
    view === "streams" ? openStream(item)
    : view === "subjects" ? openSubject(item)
    : view === "topics" ? openTopic(item)
    : view === "sessions" ? openSession(item)
    : view === "quizzes" ? openQuiz(item)
    : undefined;

  // ---- Save handlers ----
  const save = async (form) => {
    setSaving(true);
    setError("");
    try {
      const { type, mode, data } = modal;
      if (type === "stream") {
        if (mode === "add") await contentService.createStream(form);
        else await contentService.updateStream(data._id, form);
      } else if (type === "subject") {
        if (mode === "add") await contentService.createSubject({ ...form, stream: stream._id });
        else await contentService.updateSubject(data._id, form);
      } else if (type === "topic") {
        if (mode === "add") await contentService.createTopic({ ...form, subject: subject._id });
        else await contentService.updateTopic(data._id, form);
      } else if (type === "session") {
        if (mode === "add") await contentService.createSession({ ...form, subject: subject._id, topic: topic._id });
        else await contentService.updateSession(data._id, form);
      } else if (type === "quiz") {
        if (mode === "add") await contentService.createQuiz({ ...form, subject: subject._id, session: session._id });
        else await contentService.updateQuiz(data._id, form);
      }
      setModal(null);
      load(view);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Question add/edit uses the shared QuestionFormModal, which passes a clean payload.
  const saveQuestion = async (payload) => {
    setSaving(true);
    setError("");
    try {
      if (modal.mode === "add") {
        await contentService.createQuestion({ ...payload, subject: subject._id, session: session._id, quiz: quiz._id });
      } else {
        await contentService.updateQuestion(modal.data._id, payload);
      }
      setModal(null);
      load(view);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (type, id, label) => {
    if (!window.confirm(`Delete "${label}"? This also removes everything inside it.`)) return;
    try {
      if (type === "stream") await contentService.deleteStream(id);
      else if (type === "subject") await contentService.deleteSubject(id);
      else if (type === "topic") await contentService.deleteTopic(id);
      else if (type === "session") await contentService.deleteSession(id);
      else if (type === "quiz") await contentService.deleteQuiz(id);
      else if (type === "question") await contentService.deleteQuestion(id);
      load(view);
    } catch (e) {
      setError(e.message);
    }
  };

  // ---- Breadcrumb ----
  const Crumb = () => (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      <button onClick={() => goTo("streams")} className={`rounded px-2 py-1 font-medium ${view === "streams" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>Streams</button>
      {stream && view !== "streams" && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("subjects")} className={`rounded px-2 py-1 font-medium ${view === "subjects" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{stream.name}</button>
      </>)}
      {subject && view !== "streams" && view !== "subjects" && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("topics")} className={`rounded px-2 py-1 font-medium ${view === "topics" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{subject.name}</button>
      </>)}
      {topic && (view === "sessions" || view === "quizzes" || view === "questions") && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("sessions")} className={`rounded px-2 py-1 font-medium ${view === "sessions" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{topic.title}</button>
      </>)}
      {session && (view === "quizzes" || view === "questions") && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("quizzes")} className={`rounded px-2 py-1 font-medium ${view === "quizzes" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{session.title}</button>
      </>)}
      {quiz && view === "questions" && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <span className="rounded px-2 py-1 font-medium text-brand-600">{quiz.title}</span>
      </>)}
    </nav>
  );

  const headings = {
    streams: { title: "Streams", add: "Add Stream", icon: GraduationCap },
    subjects: { title: `Subjects in ${stream?.name || ""}`, add: "Add Subject", icon: FolderOpen },
    topics: { title: `Topics in ${subject?.name || ""}`, add: "Add Topic", icon: Layers },
    sessions: { title: `Sessions in ${topic?.title || ""}`, add: "Add Session", icon: BookOpen },
    quizzes: { title: `Quizzes in ${session?.title || ""}`, add: "Add Quiz", icon: ListChecks },
    questions: { title: `Questions in ${quiz?.title || ""}`, add: "Add Question", icon: HelpCircle },
  };
  const H = headings[view];

  const openAdd = () => setModal({ type: VIEW_TYPE[view], mode: "add", data: {} });
  const openEdit = (item) => setModal({ type: VIEW_TYPE[view], mode: "edit", data: item });

  // Copy all questions of the current quiz as CSV text to the clipboard.
  const copyCsv = async (questions) => {
    if (!questions?.length) return;
    try {
      await navigator.clipboard.writeText(questionsToCsv(questions));
      window.alert(`Copied ${questions.length} question(s) as CSV to the clipboard.`);
    } catch {
      window.alert("Couldn't access the clipboard — use “Download CSV” instead.");
    }
  };

  // Download all questions of the current quiz as a .csv file.
  const downloadCsv = (questions, name) => {
    if (!questions?.length) return;
    const url = URL.createObjectURL(new Blob([questionsToCsv(questions)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(name || "quiz").replace(/[^\w-]+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Fuzzy question search: 40%+ matches, best first (null when not searching).
  const questionResults = view === "questions" ? searchQuestions(items, search) : null;
  const shown = questionResults || items;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Content Management</h1>
          <p className="text-slate-500 dark:text-slate-400">Stream → Subject → Topic → Session → Quiz → Questions. Add, edit or delete at any level.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setDupScope({ id: subject?._id || "all", name: subject?.name || "" }); setDupOpen(true); }}
            className="btn-outline"
            title={subject ? `Scan duplicates in ${subject.name}` : "Scan all questions for duplicates"}
          >
            <Files className="h-4 w-4" /> Find Duplicates{subject ? ` — ${subject.name}` : ""}
          </button>
          {view === "questions" && (
            <>
              <button onClick={() => setViewAll(true)} className="btn-outline">
                <Eye className="h-4 w-4" /> View All
              </button>
              <button onClick={() => setBulkOpen(true)} className="btn-outline">
                <Upload className="h-4 w-4" /> Bulk Upload
              </button>
              <button onClick={() => { setAiTarget(null); setAiOpen(true); }} className="btn-outline text-brand-600">
                <Sparkles className="h-4 w-4" /> Generate with AI
              </button>
              <button onClick={() => { setAiTarget(null); setImportOpen(true); }} className="btn-outline text-brand-600">
                <Globe className="h-4 w-4" /> Import from Web
              </button>
              <button onClick={() => setExtendOpen(true)} disabled={!items.length} className="btn-outline text-brand-600" title="AI: make all explanations detailed for this quiz">
                <Wand2 className="h-4 w-4" /> Extend Explanations
              </button>
              <button onClick={() => setRegenAllOpen(true)} disabled={!items.length} className="btn-outline text-violet-600" title="AI: regenerate every question's options/answer (reshuffles pair/matching Column B)">
                <RefreshCw className="h-4 w-4" /> Regenerate All
              </button>
              <button onClick={() => copyCsv(selected.length ? items.filter((q) => selected.includes(q._id)) : items)} disabled={!items.length} className="btn-outline">
                <Copy className="h-4 w-4" /> Copy CSV{selected.length ? ` (${selected.length})` : ""}
              </button>
              <button onClick={() => downloadCsv(selected.length ? items.filter((q) => selected.includes(q._id)) : items, quiz?.title || "quiz")} disabled={!items.length} className="btn-outline">
                <Download className="h-4 w-4" /> Download CSV{selected.length ? ` (${selected.length})` : ""}
              </button>
            </>
          )}
          <button onClick={openAdd} className="btn-primary">
            <Plus className="h-4 w-4" /> {H.add}
          </button>
        </div>
      </div>

      <div className="card px-4 py-3"><Crumb /></div>

      {loading ? (
        <Loading label={`Loading ${view}...`} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(view)} />
      ) : items.length === 0 ? (
        <EmptyState message={`No ${view} yet. Click "${H.add}".`} />
      ) : (
        <div className="space-y-3">
          {view === "questions" && (
            <div className="space-y-3">
              {/* Search questions — shows a match % (40%–100%), best first */}
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions…  (shows matches 40%–100%)"
                  className="w-full bg-transparent text-sm outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} title="Clear search" className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-700">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-brand-600" /> Select all
                </label>
                {questionResults && (
                  <span className="text-sm font-medium text-slate-500">{questionResults.length} match{questionResults.length === 1 ? "" : "es"} (40%+)</span>
                )}
                {selected.length > 0 && (
                  <>
                    <span className="text-sm text-slate-500">{selected.length} selected</span>
                    <button onClick={deleteSelected} className="btn-outline py-1.5 text-rose-600"><Trash2 className="h-4 w-4" /> Delete selected</button>
                    <button onClick={() => setSelected([])} className="text-sm text-slate-500 hover:underline">Clear</button>
                  </>
                )}
              </div>
            </div>
          )}
          {questionResults && questionResults.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              No questions match “{search}” at 40% or higher. Try fewer or different words.
            </p>
          )}
          {shown.map((item, i) => (
            <div
              key={item._id}
              onClick={view !== "questions" ? () => openItem(item) : undefined}
              className={`card flex items-center justify-between gap-3 p-4 ${view !== "questions" ? "cursor-pointer transition hover:border-brand-300 dark:hover:border-brand-600" : ""}`}
            >
              {view === "questions" && (
                <input type="checkbox" checked={selected.includes(item._id)} onChange={() => toggleSelect(item._id)} className="h-4 w-4 flex-shrink-0 accent-brand-600" />
              )}
              <div className="min-w-0 flex-1">
                {view === "questions" ? (
                  <>
                    <p className="truncate font-medium"><span className="text-slate-400">Q{i + 1}.</span> {item.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {item._match != null && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{item._match}% match</span>
                      )}
                      <Badge variant={item.type === "matching" ? "accent" : "brand"}>
                        {item.type === "matching" ? "Matching" : "MCQ"}
                      </Badge>
                      <Badge variant={item.difficulty}>{item.difficulty}</Badge>
                      <Badge variant={item.status === "published" ? "brand" : "neutral"}>{item.status}</Badge>
                      {item.correct !== undefined && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Correct: {String.fromCharCode(65 + item.correct)}</span>
                      )}
                      {questionDateText(item) && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" /> {questionDateText(item)}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <H.icon className="h-5 w-5 text-brand-500" />
                      <p className="font-semibold">{item.name || item.title}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {view === "streams" && `${item.subjects ?? 0} subjects`}
                      {view === "subjects" && `${item.topics ?? 0} topics`}
                      {view === "topics" && `${item.sessions ?? 0} sessions`}
                      {view === "sessions" && `${item.quizzes ?? 0} quizzes · ${item.difficulty}`}
                      {view === "quizzes" && `${item.questions ?? 0} questions · ${item.difficulty}`}
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {view === "subjects" && (
                  <button
                    onClick={() => { setDupScope({ id: item._id, name: item.name }); setDupOpen(true); }}
                    title={`Find duplicates in ${item.name}`}
                    className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                  >
                    <Files className="h-4 w-4" />
                  </button>
                )}
                {view !== "questions" && (
                  <button
                    onClick={() =>
                      view === "streams"
                        ? openStream(item)
                        : view === "subjects"
                        ? openSubject(item)
                        : view === "topics"
                        ? openTopic(item)
                        : view === "sessions"
                        ? openSession(item)
                        : openQuiz(item)
                    }
                    className="btn-outline py-2"
                  >
                    Manage <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                {view === "questions" && (
                  <button onClick={() => setViewQ(item)} title="View" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                {view === "questions" && (
                  <button onClick={() => extendOneQuestion(item)} disabled={extendingQId === item._id} title="Extend this explanation with AI" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-900/30">
                    {extendingQId === item._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  </button>
                )}
                {view === "questions" && (
                  <button onClick={() => regenerateQ(item)} disabled={regenId === item._id} title="Regenerate options/answer to fit the question (reshuffles pair/matching columns)" className="rounded-lg p-2 text-violet-600 hover:bg-violet-50 disabled:opacity-50 dark:hover:bg-violet-900/30">
                    {regenId === item._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </button>
                )}
                <button onClick={() => openEdit(item)} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(VIEW_TYPE[view], item._id, item.name || item.title || "this question")} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (modal.type === "question" ? (
        <QuestionFormModal
          key={modal.mode === "edit" ? modal.data?._id : "new-question"}
          question={modal.mode === "edit" ? modal.data : null}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={saveQuestion}
        />
      ) : (
        <FormModal
          modal={modal}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={save}
        />
      ))}

      <BulkUploadQuestions
        open={bulkOpen}
        title={`Bulk Upload Questions${quiz ? ` — ${quiz.title}` : ""}`}
        onClose={() => setBulkOpen(false)}
        onUpload={async (questions, opts = {}) => {
          if (opts.replace) {
            for (const it of items) await contentService.deleteQuestion(it._id);
          }
          const res = await contentService.bulkQuestions(questions, {
            subject: subject._id,
            session: session._id,
            quiz: quiz._id,
          });
          load("questions");
          return res;
        }}
      />

      <AiGenerate
        open={aiOpen}
        title={`Generate with AI${quiz ? ` — ${quiz.title}` : ""}`}
        onClose={() => setAiOpen(false)}
        allowNewTarget
        newLeafLabel="quiz"
        currentTargetName={aiTarget?.title || quiz?.title || ""}
        existingQuestions={view === "questions" ? items : []}
        onUpload={(questions, opts = {}) => saveAiBatch(questions, opts)}
      />

      <AiImport
        open={importOpen}
        title={`Import from Web${quiz ? ` — ${quiz.title}` : ""}`}
        onClose={() => setImportOpen(false)}
        allowNewTarget
        newLeafLabel="quiz"
        currentTargetName={aiTarget?.title || quiz?.title || ""}
        onUpload={(questions, opts = {}) => saveAiBatch(questions, opts)}
      />

      <DuplicatesModal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        defaultSubject={dupScope.id}
        defaultSubjectName={dupScope.name}
      />

      <ExtendExplanationsModal
        open={extendOpen}
        target={{ quiz: quiz?._id }}
        title={`Extend all explanations${quiz ? ` — ${quiz.title}` : ""}`}
        onClose={() => setExtendOpen(false)}
        onDone={() => load("questions")}
      />

      <RegenerateAllModal
        open={regenAllOpen}
        target={{ quiz: quiz?._id }}
        title={`Regenerate all${quiz ? ` — ${quiz.title}` : ""}`}
        onClose={() => setRegenAllOpen(false)}
        onDone={() => load("questions")}
      />

      <ScheduleQuestionModal open={!!scheduleQ} question={scheduleQ} onClose={() => setScheduleQ(null)} />

      <ExtendOneQuestionModal
        open={!!extendOneItem}
        busy={!!extendingQId}
        onCancel={() => setExtendOneItem(null)}
        onConfirm={runExtendOne}
      />

      {/* View single question */}
      {viewQ && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewQ(null)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Question</h3>
              <button onClick={() => setViewQ(null)}><X className="h-5 w-5" /></button>
            </div>
            <QuestionView q={viewQ} onRegenerate={() => regenerateQ(viewQ)} regenerating={regenId === viewQ._id} onExtend={() => setExtendOneItem(viewQ)} extending={extendingQId === viewQ._id} onSchedule={() => setScheduleQ(viewQ)} />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAddToTestQ(viewQ)} className="btn-outline">
                <ClipboardList className="h-4 w-4" /> Add to test
              </button>
              <button onClick={() => setViewQ(null)} className="btn-primary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Copy the viewed question into a chosen test series */}
      {addToTestQ && (
        <AddToTestModal question={addToTestQ} onClose={() => setAddToTestQ(null)} />
      )}

      {/* View all questions */}
      {viewAll && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewAll(false)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-3xl animate-scale-in card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold">All questions {quiz ? `in ${quiz.title}` : ""} ({items.length})</h3>
              <div className="flex items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold dark:border-slate-700">
                  <button onClick={() => setStudentView(false)} className={`px-3 py-1.5 ${!studentView ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Admin view</button>
                  <button onClick={() => setStudentView(true)} className={`px-3 py-1.5 ${studentView ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Student view</button>
                </div>
                <button onClick={() => setViewAll(false)}><X className="h-5 w-5" /></button>
              </div>
            </div>
            {studentView && (
              <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Student view — answers &amp; explanations are hidden. Use “Reveal answer” on any question to expose it.
              </p>
            )}
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {items.map((it, i) => (
                <div key={(studentView ? "s" : "a") + it._id} className="relative rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    <button onClick={() => setAddToTestQ(it)} title="Add to test" className="rounded-lg bg-white p-1.5 text-emerald-600 shadow hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-900/30">
                      <ClipboardList className="h-4 w-4" />
                    </button>
                    {!studentView && (
                      <>
                        <button onClick={() => { setViewAll(false); openEdit(it); }} title="Edit" className="rounded-lg bg-white p-1.5 text-brand-600 shadow hover:bg-brand-50 dark:bg-slate-800 dark:hover:bg-brand-900/30">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove("question", it._id, "this question")} title="Delete" className="rounded-lg bg-white p-1.5 text-rose-600 shadow hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-900/30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                  <QuestionView q={it} index={i + 1} studentView={studentView} onRegenerate={() => regenerateQ(it)} regenerating={regenId === it._id} onExtend={() => setExtendOneItem(it)} extending={extendingQId === it._id} onSchedule={() => setScheduleQ(it)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Form modal (adapts to subject/topic/session/question) ---------------- */
function FormModal({ modal, saving, onClose, onSave }) {
  const { type, mode, data } = modal;
  const [form, setForm] = useState(() => {
    if (type === "stream") return { name: data.name || "", description: data.description || "", icon: data.icon || "GraduationCap", color: data.color || COLORS[0] };
    if (type === "subject") return { name: data.name || "", description: data.description || "", icon: data.icon || "BookOpen", color: data.color || COLORS[0] };
    if (type === "topic") return { title: data.title || "", description: data.description || "", index: data.index || 1 };
    if (type === "session") return { title: data.title || "", difficulty: data.difficulty || "Medium", index: data.index || 1 };
    if (type === "quiz") return { title: data.title || "", difficulty: data.difficulty || "Medium", index: data.index || 1 };
    return {};
  });

  const titleMap = { stream: "Stream", subject: "Subject", topic: "Topic", session: "Session", quiz: "Quiz" };
  const submit = (e) => { e.preventDefault(); onSave(form); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <form onSubmit={submit} className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{mode === "add" ? "Add" : "Edit"} {titleMap[type]}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          {(type === "stream" || type === "subject") && (
            <>
              <Field label="Name"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={type === "stream" ? "e.g. JKSSB" : "e.g. Physics"} /></Field>
              <Field label="Description"><textarea rows={2} className="input resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Icon name (lucide)"><input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="e.g. Atom, FlaskConical, BookOpen" /></Field>
              <Field label="Colour">
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button type="button" key={c} onClick={() => setForm({ ...form, color: c })} className={`h-9 w-14 rounded-lg bg-gradient-to-br ${c} ${form.color === c ? "ring-2 ring-offset-2 ring-slate-800 dark:ring-white dark:ring-offset-slate-900" : ""}`} />
                  ))}
                </div>
              </Field>
            </>
          )}

          {type === "topic" && (
            <>
              <Field label="Topic Title"><input required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mechanics" /></Field>
              <Field label="Description"><textarea rows={2} className="input resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Order (index)"><input type="number" className="input" value={form.index} onChange={(e) => setForm({ ...form, index: +e.target.value })} /></Field>
            </>
          )}

          {type === "session" && (
            <>
              <Field label="Session Title"><input required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Laws of Motion" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Difficulty">
                  <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </Field>
                <Field label="Order (index)"><input type="number" className="input" value={form.index} onChange={(e) => setForm({ ...form, index: +e.target.value })} /></Field>
              </div>
            </>
          )}

          {type === "quiz" && (
            <>
              <Field label="Quiz Title"><input required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Practice Set 1" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Difficulty">
                  <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </Field>
                <Field label="Order (index)"><input type="number" className="input" value={form.index} onChange={(e) => setForm({ ...form, index: +e.target.value })} /></Field>
              </div>
            </>
          )}

        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
