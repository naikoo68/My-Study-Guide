import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, ChevronRight, GraduationCap, FolderOpen, ListChecks, FileStack, HelpCircle, Users, Search, Share2, ClipboardList, ArrowRightLeft } from "lucide-react";
import { practiceService, testService, contentService, aiService } from "../../services";
import { loadNav, saveNav } from "../../lib/navState";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import QuestionFormModal from "../../components/admin/QuestionFormModal";
import BulkUploadQuestions, { questionsToCsv } from "../../components/admin/BulkUploadQuestions";
import AiGenerate from "../../components/admin/AiGenerate";
import AiImport from "../../components/admin/AiImport";
import DuplicatesModal from "../../components/admin/DuplicatesModal";
import QuestionView from "../../components/admin/QuestionView";
import AddToTestModal from "../../components/admin/AddToTestModal";
import PickFromBank from "../../components/admin/PickFromBank";
import ManageTestQuestions from "../../components/admin/ManageTestQuestions";
import SubjectPlanEditor from "../../components/admin/SubjectPlanEditor";
import ShareTestModal from "../../components/admin/ShareTestModal";
import ExtendExplanationsModal from "../../components/admin/ExtendExplanationsModal";
import ExtendOneQuestionModal from "../../components/admin/ExtendOneQuestionModal";
import RegenerateAllModal from "../../components/admin/RegenerateAllModal";
import ScheduleQuestionModal from "../../components/admin/ScheduleQuestionModal";
import MigrateQuizModal from "../../components/admin/MigrateQuizModal";
import MigrateTopicsModal from "../../components/admin/MigrateTopicsModal";
import { Files } from "lucide-react";

// Subject names from a practice item's typed plan (for "add to subject" tools).
const sectionsOf = (item) => (item?.subjectPlan || []).map((p) => p.subject).filter(Boolean);
// Normalize a chosen subject: "__unassigned__" means "no subject".
const normSection = (s) => (s && s !== "__unassigned__" ? s : "");

const KINDS = [
  { key: "quiz", label: "My Quiz", icon: ListChecks },
  { key: "test", label: "My Test", icon: FileStack },
];

// `clientMode` renders this same manager for a self-service CLIENT account:
// the backend scopes everything to that client's own content, so we just hide
// the per-student "Visibility" control (irrelevant — a client is the only
// viewer) and add a "Practice" button so they can take their own quizzes/tests.
export default function AdminPractice({ clientMode = false }) {
  // Remember drill-down position across refreshes (separate keys for the admin
  // panel and the client workspace so they never clash).
  const NAV_KEY = clientMode ? "mpm-client-practice-nav" : "mpm-admin-practice-nav";
  const [kind, setKind] = useState(() => loadNav(NAV_KEY).kind || "quiz");
  const [view, setView] = useState(() => loadNav(NAV_KEY).view || "streams"); // streams | subjects | topics | items
  const [stream, setStream] = useState(() => loadNav(NAV_KEY).stream || null);
  const [subject, setSubject] = useState(() => loadNav(NAV_KEY).subject || null);
  const [topic, setTopic] = useState(() => loadNav(NAV_KEY).topic || null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { type, mode, data }
  const [saving, setSaving] = useState(false);

  // Question management for one item
  const [qItem, setQItem] = useState(null);
  const [tq, setTq] = useState([]);
  const [tqLoading, setTqLoading] = useState(false);
  const [tqModal, setTqModal] = useState(null);
  const [tqSaving, setTqSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState(null); // {id,name} — after AI creates a new quiz/test, later batches target it
  const [bankOpen, setBankOpen] = useState(false); // hand-pick questions from the bank
  const [dupOpen, setDupOpen] = useState(false);
  const [dupScope, setDupScope] = useState({ params: null, name: "" }); // duplicate-scan target
  const [viewQ, setViewQ] = useState(null);
  const [addToTestQ, setAddToTestQ] = useState(null); // question being copied into a test
  const [viewAll, setViewAll] = useState(false);
  const [studentView, setStudentView] = useState(true); // View All: defaults to student view (answers hidden)
  const [shareItem, setShareItem] = useState(null); // public share-link modal target (tests)
  const [migrateItem, setMigrateItem] = useState(null); // per-quiz migrate modal target (My Quiz)
  const [selTopics, setSelTopics] = useState({}); // checkbox selection in the topics view (id -> true)
  const [migrateTopicsOpen, setMigrateTopicsOpen] = useState(false); // bulk-topic migrate modal
  const [extendItem, setExtendItem] = useState(null); // AI extend-explanations target
  const [extendingQId, setExtendingQId] = useState(null); // per-question extend in progress
  const [extendOneItem, setExtendOneItem] = useState(null); // per-question extend confirm modal target
  const [regenId, setRegenId] = useState(null); // per-question regenerate in progress
  const [regenAllItem, setRegenAllItem] = useState(null); // bulk "regenerate all" modal target
  const [scheduleQ, setScheduleQ] = useState(null); // question to post/schedule to Facebook
  // Which subject a question-adding tool should target (set when opened from a
  // subject inside the manager). "" / "__unassigned__" means no subject.
  const [forceSection, setForceSection] = useState("");

  // Visibility management for one item
  const [access, setAccess] = useState(null); // { itemId, name, visibleToAll, users:[] }
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessSearch, setAccessSearch] = useState("");

  const load = (which) => {
    setLoading(true);
    setError("");
    const p =
      which === "streams" ? practiceService.adminStreams(kind)
      : which === "subjects" ? practiceService.adminSubjects(stream._id)
      : which === "topics" ? practiceService.adminTopics(subject._id)
      : kind === "quiz" ? practiceService.adminTopicItems(topic._id)
      : practiceService.adminItems(subject._id, "test");
    p.then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(view); /* eslint-disable-next-line */ }, [view, kind]);

  // Remember the current drill-down position so a page refresh restores it.
  useEffect(() => {
    saveNav(NAV_KEY, { kind, view, stream, subject, topic });
  }, [NAV_KEY, kind, view, stream, subject, topic]);

  const openStream = (s) => { setStream(s); setSubject(null); setTopic(null); setView("subjects"); };
  // My Quiz drills into Topics; My Test Series goes straight to items.
  const openSubject = (s) => { setSubject(s); setTopic(null); setView(kind === "quiz" ? "topics" : "items"); };
  const openTopic = (t) => { setTopic(t); setView("items"); };
  const goTo = (v) => setView(v);

  // Clear topic multi-select whenever we navigate.
  useEffect(() => { setSelTopics({}); }, [view, subject?._id, stream?._id, kind]);
  const toggleTopicSel = (id) => setSelTopics((s) => ({ ...s, [id]: !s[id] }));
  const selectedTopics = () => items.filter((it) => selTopics[it._id]).map((it) => ({ _id: it._id, name: it.name }));
  const allTopicsSelected = items.length > 0 && items.every((it) => selTopics[it._id]);
  const toggleAllTopics = () => setSelTopics(allTopicsSelected ? {} : Object.fromEntries(items.map((it) => [it._id, true])));
  const selectedTopicCount = items.filter((it) => selTopics[it._id]).length;

  // ---- Entity CRUD ----
  const saveEntity = async (form) => {
    setSaving(true);
    try {
      const { type, mode, data } = modal;
      if (type === "stream") mode === "add" ? await practiceService.createStream({ ...form, kind }) : await practiceService.updateStream(data._id, form);
      else if (type === "subject") mode === "add" ? await practiceService.createSubject({ ...form, stream: stream._id }) : await practiceService.updateSubject(data._id, form);
      else if (type === "topic") mode === "add" ? await practiceService.createTopic({ ...form, subject: subject._id }) : await practiceService.updateTopic(data._id, form);
      else if (type === "item") {
        if (mode === "add") await practiceService.createItem({ ...form, practiceStream: stream._id, practiceSubject: subject._id, practiceTopic: topic?._id, practiceKind: kind });
        else await testService.update(data._id, form);
      }
      setModal(null);
      load(view);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };
  const remove = async (type, id, label) => {
    if (!window.confirm(`Delete ${label}? This also deletes everything inside it. This cannot be undone.`)) return;
    try {
      if (type === "stream") await practiceService.deleteStream(id);
      else if (type === "subject") await practiceService.deleteSubject(id);
      else if (type === "topic") await practiceService.deleteTopic(id);
      else if (type === "item") await testService.remove(id);
      load(view);
    } catch (e) { setError(e.message); }
  };

  // ---- Questions ----
  const openQuestions = (item) => {
    setQItem(item);
    setTqLoading(true);
    testService.getQuestions(item._id).then(setTq).catch((e) => setError(e.message)).finally(() => setTqLoading(false));
  };
  const reloadTq = () => testService.getQuestions(qItem._id).then(setTq).catch(() => {});

  // Save an AI-generated / imported batch. When opts.newTarget = { name } is set
  // (the "New quiz/test" option in the modal) we CREATE a new practice item under
  // the current parent and insert the batch there; later batches then target it.
  // Otherwise the batch goes into the item currently open (qItem).
  const saveAiBatch = async (questions, opts = {}) => {
    const section = opts.section || normSection(forceSection);
    let itemId = aiTarget?.id || qItem?._id;
    if (opts.newTarget) {
      const name = String(opts.newTarget.name || "").trim();
      if (!name) throw new Error(`Enter a name for the new ${kind}.`);
      const created = await practiceService.createItem({
        name,
        practiceStream: stream?._id,
        practiceSubject: subject?._id,
        practiceTopic: kind === "quiz" ? topic?._id : undefined,
        practiceKind: kind,
      });
      if (!created?._id) throw new Error(`Could not create the new ${kind}.`);
      itemId = created._id;
      setAiTarget({ id: itemId, name }); // subsequent batches target the new item
    }
    const res = await contentService.bulkQuestions(questions, { testSeries: itemId, section });
    if (itemId === qItem?._id) await reloadTq(); // refresh questions only when writing to the open item
    load("items"); // refresh the list so a newly-created quiz/test and updated counts show
    return res;
  };
  // Run the per-question extend once confirmed in the modal.
  const runExtendOne = async (fixOptions) => {
    const item = extendOneItem;
    if (!item) return;
    setExtendingQId(item._id);
    try {
      const updated = await aiService.extendOne({ questionId: item._id, fixOptions });
      setViewQ((prev) => (prev && prev._id === item._id ? { ...prev, ...updated } : prev));
      setExtendOneItem(null);
      await reloadTq();
    } catch (e) { setError(e.message); setExtendOneItem(null); }
    finally { setExtendingQId(null); }
  };
  // Regenerate ONE question's options/answer to fit its stem, then reload
  // (and update the open preview modal in place if it's the same question).
  const regenerateQ = async (item) => {
    setRegenId(item._id);
    try {
      const updated = await aiService.regenerate({ questionId: item._id });
      setViewQ((prev) => (prev && prev._id === item._id ? { ...prev, ...updated } : prev));
      await reloadTq();
    }
    catch (e) { setError(e.message); }
    finally { setRegenId(null); }
  };
  const saveTestQuestion = async (payload) => {
    setTqSaving(true);
    try {
      if (tqModal.mode === "add") await testService.addQuestion(qItem._id, payload);
      else await contentService.updateQuestion(tqModal.data._id, payload);
      setTqModal(null);
      await reloadTq();
      load("items");
    } catch (e) { setError(e.message); } finally { setTqSaving(false); }
  };
  const removeTq = async (qid) => {
    if (!window.confirm("Delete this question?")) return;
    await testService.deleteQuestion(qItem._id, qid);
    await reloadTq();
    load("items");
  };
  // CSV helpers now receive the exact list of questions to export.
  const copyCsv = async (list) => {
    if (!list?.length) return;
    try { await navigator.clipboard.writeText(questionsToCsv(list)); window.alert(`Copied ${list.length} question(s) as CSV.`); }
    catch { window.alert("Clipboard blocked — use Download CSV."); }
  };
  const downloadCsv = (list) => {
    if (!list?.length) return;
    const url = URL.createObjectURL(new Blob([questionsToCsv(list)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(qItem?.name || "questions").replace(/[^\w-]+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ---- Visibility / access ----
  const openAccess = (item) => {
    testService.getAccess(item._id).then((a) => setAccess({ itemId: item._id, ...a })).catch((e) => setError(e.message));
  };
  const saveAccess = async () => {
    setAccessSaving(true);
    try {
      await testService.updateAccess(access.itemId, {
        visibleToAll: access.visibleToAll,
        users: access.users.map((u) => ({ user: u._id, visible: u.visible, validUntil: u.validUntil })),
      });
      setAccess(null);
      load("items");
    } catch (e) { setError(e.message); } finally { setAccessSaving(false); }
  };

  const H = view === "streams" ? { title: "Streams", add: "Add Stream", icon: GraduationCap }
    : view === "subjects" ? { title: `Subjects in ${stream?.name || ""}`, add: "Add Subject", icon: FolderOpen }
    : view === "topics" ? { title: `Topics in ${subject?.name || ""}`, add: "Add Topic", icon: HelpCircle }
    : { title: `${kind === "quiz" ? "Quizzes" : "Tests"} in ${(kind === "quiz" ? topic : subject)?.name || ""}`, add: kind === "quiz" ? "Add Quiz" : "Add Test", icon: kind === "quiz" ? ListChecks : FileStack };

  const addType = view === "streams" ? "stream" : view === "subjects" ? "subject" : view === "topics" ? "topic" : "item";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">My Practice</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {clientMode
              ? "Build your own quizzes and tests, then practice them. This content is private to you."
              : "Hidden by default — grant access per student. Adding content here never notifies anyone."}
          </p>
        </div>
        <button
          onClick={() => {
            setDupScope(subject ? { params: { practiceSubject: subject._id }, name: subject.name } : { params: null, name: "" });
            setDupOpen(true);
          }}
          className="btn-outline"
          title={subject ? `Scan duplicates in ${subject.name}` : "Scan practice questions for duplicates"}
        >
          <Files className="h-4 w-4" /> Find Duplicates{subject ? ` — ${subject.name}` : ""}
        </button>
      </div>

      {/* Kind tabs */}
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => { setKind(k.key); setStream(null); setSubject(null); setTopic(null); setView("streams"); }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${kind === k.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            <k.icon className="h-4 w-4" /> {k.label}
          </button>
        ))}
      </div>

      {/* Breadcrumb */}
      <div className="card px-4 py-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <button onClick={() => goTo("streams")} className={`rounded px-2 py-1 font-medium ${view === "streams" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>Streams</button>
          {stream && view !== "streams" && (<>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <button onClick={() => goTo("subjects")} className={`rounded px-2 py-1 font-medium ${view === "subjects" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{stream.name}</button>
          </>)}
          {subject && (view === "topics" || view === "items") && (<>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <button onClick={() => goTo(kind === "quiz" ? "topics" : "items")} className={`rounded px-2 py-1 font-medium ${view === "topics" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{subject.name}</button>
          </>)}
          {topic && view === "items" && kind === "quiz" && (<>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="rounded px-2 py-1 font-medium text-brand-600">{topic.name}</span>
          </>)}
        </nav>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><H.icon className="h-5 w-5 text-brand-600" /> {H.title}</h2>
        <button onClick={() => setModal({ type: addType, mode: "add", data: {} })} className="btn-primary">
          <Plus className="h-4 w-4" /> {H.add}
        </button>
      </div>

      {/* Bulk-migrate topics: tick topics, then move them all to another subject */}
      {view === "topics" && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={allTopicsSelected} onChange={toggleAllTopics} className="h-4 w-4 accent-brand-600" />
            Select all
          </label>
          {selectedTopicCount > 0 && (
            <>
              <span className="text-sm text-slate-500">{selectedTopicCount} selected</span>
              <button onClick={() => setMigrateTopicsOpen(true)} className="btn-primary py-1.5 text-xs">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Migrate selected
              </button>
              <button onClick={() => setSelTopics({})} className="btn-ghost py-1.5 text-xs">Clear</button>
            </>
          )}
          <span className="ml-auto text-xs text-slate-400">Tick topics to move several at once</span>
        </div>
      )}

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => load(view)} /> : items.length === 0 ? (
        <EmptyState message={`Nothing here yet. Use "${H.add}".`} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item._id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                {view === "topics" && (
                  <input
                    type="checkbox"
                    checked={!!selTopics[item._id]}
                    onChange={() => toggleTopicSel(item._id)}
                    className="mt-1 h-4 w-4 flex-shrink-0 accent-brand-600"
                    title="Select to migrate"
                  />
                )}
                <button
                  onClick={() => (view === "streams" ? openStream(item) : view === "subjects" ? openSubject(item) : view === "topics" ? openTopic(item) : openQuestions(item))}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-bold">{item.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {view === "streams" && `${item.subjects ?? 0} subjects`}
                    {view === "subjects" && (kind === "quiz" ? "Open topics" : `${item.items ?? 0} tests`)}
                    {view === "topics" && `${item.items ?? 0} quizzes`}
                    {view === "items" && `${item.questionCount ?? 0} questions · ${item.visibleToAll ? "Visible to all" : "Hidden by default"}`}
                  </p>
                </button>
                <div className="flex flex-shrink-0 gap-1">
                  {view === "subjects" && (
                    <button
                      onClick={() => { setDupScope({ params: { practiceSubject: item._id }, name: item.name }); setDupOpen(true); }}
                      title={`Find duplicates in ${item.name}`}
                      className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                    >
                      <Files className="h-4 w-4" />
                    </button>
                  )}
                  {view !== "items" && (
                    <button onClick={() => setModal({ type: view === "streams" ? "stream" : view === "subjects" ? "subject" : "topic", mode: "edit", data: item })} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
                  )}
                  <button onClick={() => remove(view === "streams" ? "stream" : view === "subjects" ? "subject" : view === "topics" ? "topic" : "item", item._id, item.name)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {view === "items" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => openQuestions(item)} className="btn-outline py-1.5 text-xs"><HelpCircle className="h-3.5 w-3.5" /> Questions</button>
                  {kind === "quiz" && (
                    <button onClick={() => setMigrateItem(item)} className="btn-outline py-1.5 text-xs" title="Move or copy this quiz (My Quiz → My Quiz, or My Quiz → Content)"><ArrowRightLeft className="h-3.5 w-3.5" /> Migrate</button>
                  )}
                  {/* Public share link (no login needed) — for My Quiz AND My Test */}
                  <button onClick={() => setShareItem(item)} className={`btn-outline py-1.5 text-xs ${item.publicShare ? "text-emerald-600" : ""}`} title="Share a public link (anyone with the link can take this — no login/account needed)"><Share2 className="h-3.5 w-3.5" /> Share</button>
                  {!clientMode && (
                    <button onClick={() => openAccess(item)} className="btn-outline py-1.5 text-xs"><Users className="h-3.5 w-3.5" /> Visibility</button>
                  )}
                  <button onClick={() => { setDupScope({ params: { testSeries: item._id }, name: item.name }); setDupOpen(true); }} className="btn-outline py-1.5 text-xs"><Files className="h-3.5 w-3.5" /> Duplicates</button>
                  <button onClick={() => setModal({ type: "item", mode: "edit", data: item })} className="btn-outline py-1.5 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Entity form modal */}
      {modal && <EntityForm type={modal.type} data={modal.data} kind={kind} saving={saving} onClose={() => setModal(null)} onSave={saveEntity} />}

      {/* Questions modal */}
      {qItem && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setQItem(null)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Questions — {qItem.name}</h3>
              <button onClick={() => setQItem(null)}><X className="h-5 w-5" /></button>
            </div>

            <ManageTestQuestions
              qTest={qItem}
              tq={tq}
              tqLoading={tqLoading}
              onClose={() => setQItem(null)}
              onAddQuestion={(subject) => setTqModal({ mode: "add", data: null, forceSection: subject })}
              onEditQuestion={(item) => setTqModal({ mode: "edit", data: item })}
              onDeleteQuestion={removeTq}
              onDeleteSelected={async (ids) => {
                for (const id of ids) await testService.deleteQuestion(qItem._id, id);
                await reloadTq();
                load("items");
              }}
              onViewQuestion={setViewQ}
              onViewAll={() => setViewAll(true)}
              onDuplicates={() => { setDupScope({ params: { testSeries: qItem._id }, name: qItem.name }); setDupOpen(true); }}
              onCopyCsv={copyCsv}
              onDownloadCsv={downloadCsv}
              onBulkUpload={(subject) => { setForceSection(subject); setBulkOpen(true); }}
              onAiGenerate={(subject) => { setForceSection(subject); setAiTarget(null); setAiOpen(true); }}
              onImportWeb={(subject) => { setForceSection(subject); setAiTarget(null); setImportOpen(true); }}
              onPickFromBank={(subject) => { setForceSection(subject); setBankOpen(true); }}
              onExtendExplanations={() => setExtendItem(qItem)}
              onExtendQuestion={(item) => setExtendOneItem(item)}
              extendingId={extendingQId}
              onRegenerateQuestion={(item) => regenerateQ(item)}
              regeneratingId={regenId}
              onRegenerateAll={() => setRegenAllItem(qItem)}
            />
          </div>
        </div>
      )}

      {tqModal && (
        <QuestionFormModal
          key={tqModal.mode === "edit" ? tqModal.data?._id : "new"}
          question={tqModal.mode === "edit" ? tqModal.data : null}
          saving={tqSaving}
          sections={sectionsOf(qItem)}
          defaultSection={normSection(tqModal.forceSection)}
          onClose={() => setTqModal(null)}
          onSave={saveTestQuestion}
        />
      )}

      {viewQ && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewQ(null)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">Question</h3><button onClick={() => setViewQ(null)}><X className="h-5 w-5" /></button></div>
            <QuestionView q={viewQ} onRegenerate={() => regenerateQ(viewQ)} regenerating={regenId === viewQ._id} onExtend={() => setExtendOneItem(viewQ)} extending={extendingQId === viewQ._id} onSchedule={() => setScheduleQ(viewQ)} />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setAddToTestQ(viewQ)} className="btn-outline"><ClipboardList className="h-4 w-4" /> Add to test</button>
              <button onClick={() => setViewQ(null)} className="btn-outline">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Copy the viewed question into a chosen test */}
      {addToTestQ && (
        <AddToTestModal question={addToTestQ} clientMode={clientMode} onClose={() => setAddToTestQ(null)} />
      )}

      {/* View all questions (with edit/delete per question) */}
      {viewAll && qItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewAll(false)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-3xl animate-scale-in card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold">All questions — {qItem.name} ({tq.length})</h3>
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
              {tq.map((it, i) => (
                <div key={(studentView ? "s" : "a") + it._id} className="relative rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    <button onClick={() => setAddToTestQ(it)} title="Add to test" className="rounded-lg bg-white p-1.5 text-emerald-600 shadow hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-900/30"><ClipboardList className="h-4 w-4" /></button>
                    {!studentView && (
                      <>
                        <button onClick={() => { setViewAll(false); setTqModal({ mode: "edit", data: it }); }} title="Edit" className="rounded-lg bg-white p-1.5 text-brand-600 shadow hover:bg-brand-50 dark:bg-slate-800 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => removeTq(it._id)} title="Delete" className="rounded-lg bg-white p-1.5 text-rose-600 shadow hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                  <QuestionView q={it} index={i + 1} studentView={studentView} onRegenerate={() => regenerateQ(it)} regenerating={regenId === it._id} onExtend={() => setExtendOneItem(it)} extending={extendingQId === it._id} onSchedule={() => setScheduleQ(it)} />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end"><button onClick={() => setViewAll(false)} className="btn-outline">Close</button></div>
          </div>
        </div>
      )}

      <PickFromBank
        open={bankOpen}
        testId={qItem?._id}
        plan={qItem?.subjectPlan || []}
        practiceOnly={clientMode}
        defaultSection={normSection(forceSection)}
        title={`Hand-pick questions — ${qItem?.name || ""}${normSection(forceSection) ? ` (${normSection(forceSection)})` : ""}`}
        onClose={() => { setBankOpen(false); setForceSection(""); }}
        onDone={async () => { await reloadTq(); load(view); }}
      />

      <BulkUploadQuestions
        open={bulkOpen}
        sections={sectionsOf(qItem)}
        defaultSection={normSection(forceSection)}
        title={`Bulk Upload — ${qItem?.name || ""}${normSection(forceSection) ? ` (${normSection(forceSection)})` : ""}`}
        onClose={() => { setBulkOpen(false); setForceSection(""); }}
        onUpload={async (questions, opts = {}) => {
          const section = opts.section || normSection(forceSection);
          if (opts.replace) {
            const existing = await testService.getQuestions(qItem._id);
            for (const q of existing) await testService.deleteQuestion(qItem._id, q._id);
          }
          const res = await contentService.bulkQuestions(questions, { testSeries: qItem._id, section });
          await reloadTq();
          load("items");
          return res;
        }}
      />

      <AiGenerate
        open={aiOpen}
        sections={sectionsOf(qItem)}
        defaultSection={normSection(forceSection)}
        title={`Generate with AI — ${qItem?.name || ""}${normSection(forceSection) ? ` (${normSection(forceSection)})` : ""}`}
        onClose={() => { setAiOpen(false); setForceSection(""); }}
        allowNewTarget
        newLeafLabel={kind}
        currentTargetName={aiTarget?.name || qItem?.name || ""}
        existingQuestions={tq}
        onUpload={(questions, opts = {}) => saveAiBatch(questions, opts)}
      />

      <AiImport
        open={importOpen}
        sections={sectionsOf(qItem)}
        defaultSection={normSection(forceSection)}
        title={`Import from Web — ${qItem?.name || ""}${normSection(forceSection) ? ` (${normSection(forceSection)})` : ""}`}
        onClose={() => { setImportOpen(false); setForceSection(""); }}
        allowNewTarget
        newLeafLabel={kind}
        currentTargetName={aiTarget?.name || qItem?.name || ""}
        onUpload={(questions, opts = {}) => saveAiBatch(questions, opts)}
      />

      <DuplicatesModal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        defaultCategory={kind === "quiz" ? "Practice Quiz" : "Practice Test"}
        scope={dupScope.params}
        scopeName={dupScope.name}
        hideSubjectPicker
      />

      {/* Per-quiz migrate modal (My Quiz → My Quiz, or My Quiz → Content) */}
      {migrateItem && (
        <MigrateQuizModal
          quiz={migrateItem}
          clientMode={clientMode}
          onClose={() => setMigrateItem(null)}
          onDone={() => load("items")}
        />
      )}

      {/* Bulk-migrate selected topics to another subject */}
      {migrateTopicsOpen && (
        <MigrateTopicsModal
          topics={selectedTopics()}
          onClose={() => setMigrateTopicsOpen(false)}
          onDone={() => { setSelTopics({}); load("topics"); }}
        />
      )}

      {/* Public share-link modal (My Test / Client Test) */}
      {shareItem && (
        <ShareTestModal
          test={shareItem}
          onClose={() => setShareItem(null)}
          onUpdated={(patch) => {
            setShareItem((s) => (s ? { ...s, ...patch } : s));
            setItems((list) => list.map((x) => (x._id === shareItem._id ? { ...x, ...patch } : x)));
          }}
        />
      )}

      <ExtendExplanationsModal
        open={!!extendItem}
        target={{ testSeries: extendItem?._id }}
        title={`Extend all explanations${extendItem ? ` — ${extendItem.name}` : ""}`}
        onClose={() => setExtendItem(null)}
        onDone={() => { if (qItem) reloadTq(); }}
      />

      <ExtendOneQuestionModal
        open={!!extendOneItem}
        busy={!!extendingQId}
        onCancel={() => setExtendOneItem(null)}
        onConfirm={runExtendOne}
      />

      <RegenerateAllModal
        open={!!regenAllItem}
        target={{ testSeries: regenAllItem?._id }}
        title={`Regenerate all${regenAllItem ? ` — ${regenAllItem.name}` : ""}`}
        onClose={() => setRegenAllItem(null)}
        onDone={() => { if (qItem) reloadTq(); }}
      />

      <ScheduleQuestionModal open={!!scheduleQ} question={scheduleQ} onClose={() => setScheduleQ(null)} />

      {/* Visibility modal */}
      {access && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setAccess(null)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-lg animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Visibility — {access.name}</h3>
              <button onClick={() => setAccess(null)}><X className="h-5 w-5" /></button>
            </div>
            <label className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input type="checkbox" checked={access.visibleToAll} onChange={(e) => setAccess({ ...access, visibleToAll: e.target.checked })} className="h-4 w-4 accent-brand-600" />
              <span className="text-sm font-semibold">Visible to everyone</span>
            </label>
            {!access.visibleToAll && (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9" placeholder="Search students…" value={accessSearch} onChange={(e) => setAccessSearch(e.target.value)} />
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {access.users
                    .filter((u) => (u.name + u.email).toLowerCase().includes(accessSearch.toLowerCase()))
                    .map((u) => (
                      <label key={u._id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={u.visible}
                          onChange={(e) => setAccess({ ...access, users: access.users.map((x) => (x._id === u._id ? { ...x, visible: e.target.checked } : x)) })}
                          className="h-4 w-4 accent-brand-600"
                        />
                        <span className="min-w-0"><span className="text-sm font-medium">{u.name}</span> <span className="text-xs text-slate-400">{u.email}</span></span>
                      </label>
                    ))}
                </div>
              </>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setAccess(null)} className="btn-outline">Cancel</button>
              <button onClick={saveAccess} disabled={accessSaving} className="btn-primary">{accessSaving ? "Saving…" : "Save visibility"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small add/edit form for stream / subject / item.
function EntityForm({ type, data, kind, saving, onClose, onSave }) {
  const [form, setForm] = useState(() =>
    type === "item"
      ? { name: data.name || "", duration: data.duration || 15, marks: data.marks || 0, difficulty: data.difficulty || "Medium" }
      : { name: data.name || "", description: data.description || "" }
  );
  // Manual subject blueprint for TEST items (subject name + planned count).
  const [composition, setComposition] = useState(() =>
    (data.subjectPlan || []).map((r) => ({ subject: r.subject || "", count: r.count ?? 0 }))
  );
  const isTestItem = type === "item" && kind === "test";
  const title = type === "item" ? (kind === "quiz" ? "Quiz" : "Test") : type === "stream" ? "Stream" : type === "topic" ? "Topic" : "Subject";

  const submit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (isTestItem) {
      payload.subjectPlan = composition
        .filter((r) => r.subject?.trim())
        .map((r) => ({ subject: r.subject.trim(), count: parseInt(r.count, 10) || 0 }));
    }
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="my-8 w-full max-w-md animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{data._id ? "Edit" : "Add"} {title}</h3><button type="button" onClick={onClose}><X className="h-5 w-5" /></button></div>
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-sm font-medium">Name</label><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          {type !== "item" ? (
            <div><label className="mb-1.5 block text-sm font-medium">Description (optional)</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div><label className="mb-1.5 block text-sm font-medium">Duration (min)</label><input type="number" className="input" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} /></div>
              <div><label className="mb-1.5 block text-sm font-medium">Marks</label><input type="number" className="input" value={form.marks} onChange={(e) => setForm({ ...form, marks: Number(e.target.value) })} /></div>
              <div><label className="mb-1.5 block text-sm font-medium">Difficulty</label><select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
            </div>
          )}
          {isTestItem && (
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <label className="mb-1 block text-sm font-semibold">Subjects &amp; questions per subject (optional)</label>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Type your subjects and how many questions each. Afterwards, tap the test → tap a subject to add
                questions (up to its limit).
              </p>
              <SubjectPlanEditor rows={composition} onChange={setComposition} />
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="btn-outline">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save"}</button></div>
      </form>
    </div>
  );
}
