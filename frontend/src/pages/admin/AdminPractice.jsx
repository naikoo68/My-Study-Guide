import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, ChevronRight, GraduationCap, FolderOpen, ListChecks, FileStack, HelpCircle, Upload, Eye, Users, Copy, Search, Download, Sparkles, Globe } from "lucide-react";
import { practiceService, testService, contentService } from "../../services";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import QuestionFormModal from "../../components/admin/QuestionFormModal";
import BulkUploadQuestions, { questionsToCsv } from "../../components/admin/BulkUploadQuestions";
import AiGenerate from "../../components/admin/AiGenerate";
import AiImport from "../../components/admin/AiImport";
import DuplicatesModal from "../../components/admin/DuplicatesModal";
import QuestionView from "../../components/admin/QuestionView";
import { Files } from "lucide-react";

const KINDS = [
  { key: "quiz", label: "My Quiz", icon: ListChecks },
  { key: "test", label: "My Test Series", icon: FileStack },
];

export default function AdminPractice() {
  const [kind, setKind] = useState("quiz");
  const [view, setView] = useState("streams"); // streams | subjects | topics | items
  const [stream, setStream] = useState(null);
  const [subject, setSubject] = useState(null);
  const [topic, setTopic] = useState(null);
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
  const [dupOpen, setDupOpen] = useState(false);
  const [viewQ, setViewQ] = useState(null);
  const [viewAll, setViewAll] = useState(false);
  const [selectedQ, setSelectedQ] = useState([]);

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

  const openStream = (s) => { setStream(s); setSubject(null); setTopic(null); setView("subjects"); };
  // My Quiz drills into Topics; My Test Series goes straight to items.
  const openSubject = (s) => { setSubject(s); setTopic(null); setView(kind === "quiz" ? "topics" : "items"); };
  const openTopic = (t) => { setTopic(t); setView("items"); };
  const goTo = (v) => setView(v);

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
    setSelectedQ([]);
    setTqLoading(true);
    testService.getQuestions(item._id).then(setTq).catch((e) => setError(e.message)).finally(() => setTqLoading(false));
  };
  const toggleSelectQ = (id) => setSelectedQ((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allQSelected = tq.length > 0 && selectedQ.length === tq.length;
  const toggleAllQ = () => setSelectedQ(allQSelected ? [] : tq.map((q) => q._id));
  const deleteSelectedQ = async () => {
    if (!selectedQ.length || !window.confirm(`Delete ${selectedQ.length} selected question(s)? This cannot be undone.`)) return;
    for (const id of selectedQ) await testService.deleteQuestion(qItem._id, id);
    setSelectedQ([]);
    await reloadTq();
    load("items");
  };
  const csvQuestions = () => (selectedQ.length ? tq.filter((q) => selectedQ.includes(q._id)) : tq);
  const downloadCsv = () => {
    const list = csvQuestions();
    if (!list.length) return;
    const url = URL.createObjectURL(new Blob([questionsToCsv(list)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(qItem?.name || "questions").replace(/[^\w-]+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const reloadTq = () => testService.getQuestions(qItem._id).then(setTq).catch(() => {});
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
  const copyCsv = async () => {
    const list = csvQuestions();
    if (!list.length) return;
    try { await navigator.clipboard.writeText(questionsToCsv(list)); window.alert(`Copied ${list.length} question(s) as CSV.`); }
    catch { window.alert("Clipboard blocked — use Download CSV."); }
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
          <h1 className="text-2xl font-extrabold">Practice Quizzes</h1>
          <p className="text-slate-500 dark:text-slate-400">Hidden by default — grant access per student. Adding content here never notifies anyone.</p>
        </div>
        <button onClick={() => setDupOpen(true)} className="btn-outline" title="Scan practice questions for duplicates">
          <Files className="h-4 w-4" /> Find Duplicates
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

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => load(view)} /> : items.length === 0 ? (
        <EmptyState message={`Nothing here yet. Use "${H.add}".`} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item._id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
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
                  {view !== "items" && (
                    <button onClick={() => setModal({ type: view === "streams" ? "stream" : view === "subjects" ? "subject" : "topic", mode: "edit", data: item })} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
                  )}
                  <button onClick={() => remove(view === "streams" ? "stream" : view === "subjects" ? "subject" : view === "topics" ? "topic" : "item", item._id, item.name)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {view === "items" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => openQuestions(item)} className="btn-outline py-1.5 text-xs"><HelpCircle className="h-3.5 w-3.5" /> Questions</button>
                  <button onClick={() => openAccess(item)} className="btn-outline py-1.5 text-xs"><Users className="h-3.5 w-3.5" /> Visibility</button>
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
            <div className="mb-4 flex flex-wrap justify-end gap-2">
              {tq.length > 0 && <button onClick={() => setViewAll(true)} className="btn-outline"><Eye className="h-4 w-4" /> View All</button>}
              {tq.length > 0 && <button onClick={copyCsv} className="btn-outline"><Copy className="h-4 w-4" /> Copy CSV{selectedQ.length ? ` (${selectedQ.length})` : ""}</button>}
              {tq.length > 0 && <button onClick={downloadCsv} className="btn-outline"><Download className="h-4 w-4" /> Download CSV{selectedQ.length ? ` (${selectedQ.length})` : ""}</button>}
              <button onClick={() => setBulkOpen(true)} className="btn-outline"><Upload className="h-4 w-4" /> Bulk Upload</button>
              <button onClick={() => setAiOpen(true)} className="btn-outline text-brand-600"><Sparkles className="h-4 w-4" /> Generate with AI</button>
              <button onClick={() => setImportOpen(true)} className="btn-outline text-brand-600"><Globe className="h-4 w-4" /> Import from Web</button>
              <button onClick={() => setTqModal({ mode: "add", data: null })} className="btn-primary"><Plus className="h-4 w-4" /> Add Question</button>
            </div>
            {tqLoading ? <Loading /> : tq.length === 0 ? <EmptyState message="No questions yet." /> : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allQSelected} onChange={toggleAllQ} className="h-4 w-4 accent-brand-600" /> Select all</label>
                  {selectedQ.length > 0 && (<>
                    <span className="text-sm text-slate-500">{selectedQ.length} selected</span>
                    <button onClick={deleteSelectedQ} className="inline-flex items-center gap-1 text-sm font-semibold text-rose-600"><Trash2 className="h-4 w-4" /> Delete selected</button>
                    <button onClick={() => setSelectedQ([])} className="text-sm text-slate-500 hover:underline">Clear</button>
                  </>)}
                </div>
                <div className="space-y-3">
                  {tq.map((item, i) => (
                    <div key={item._id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <div className="flex min-w-0 items-start gap-2">
                        <input type="checkbox" checked={selectedQ.includes(item._id)} onChange={() => toggleSelectQ(item._id)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-600" />
                        <div className="min-w-0">
                          <p className="font-medium">Q{i + 1}. {item.text}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant={item.type === "matching" ? "accent" : "brand"}>{item.type === "matching" ? "Matching" : (item.type || "mcq") === "mcq" ? "MCQ" : item.type}</Badge>
                            {item.difficulty && <Badge variant={item.difficulty}>{item.difficulty}</Badge>}
                            {item.status && <Badge variant={item.status === "published" ? "brand" : "neutral"}>{item.status}</Badge>}
                            {item.correct != null && (
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Correct: {String.fromCharCode(65 + item.correct)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        <button onClick={() => setViewQ(item)} title="View" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => setTqModal({ mode: "edit", data: item })} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => removeTq(item._id)} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="mt-6 flex justify-end"><button onClick={() => setQItem(null)} className="btn-outline">Close</button></div>
          </div>
        </div>
      )}

      {tqModal && (
        <QuestionFormModal
          key={tqModal.mode === "edit" ? tqModal.data?._id : "new"}
          question={tqModal.mode === "edit" ? tqModal.data : null}
          saving={tqSaving}
          onClose={() => setTqModal(null)}
          onSave={saveTestQuestion}
        />
      )}

      {viewQ && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewQ(null)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">Question</h3><button onClick={() => setViewQ(null)}><X className="h-5 w-5" /></button></div>
            <QuestionView q={viewQ} />
            <div className="mt-6 flex justify-end"><button onClick={() => setViewQ(null)} className="btn-outline">Close</button></div>
          </div>
        </div>
      )}

      {/* View all questions (with edit/delete per question) */}
      {viewAll && qItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewAll(false)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-3xl animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">All questions — {qItem.name} ({tq.length})</h3>
              <button onClick={() => setViewAll(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {tq.map((it, i) => (
                <div key={it._id} className="relative rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    <button onClick={() => { setViewAll(false); setTqModal({ mode: "edit", data: it }); }} title="Edit" className="rounded-lg bg-white p-1.5 text-brand-600 shadow hover:bg-brand-50 dark:bg-slate-800 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => removeTq(it._id)} title="Delete" className="rounded-lg bg-white p-1.5 text-rose-600 shadow hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <QuestionView q={it} index={i + 1} />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end"><button onClick={() => setViewAll(false)} className="btn-outline">Close</button></div>
          </div>
        </div>
      )}

      <BulkUploadQuestions
        open={bulkOpen}
        title={`Bulk Upload — ${qItem?.name || ""}`}
        onClose={() => setBulkOpen(false)}
        onUpload={async (questions, opts = {}) => {
          if (opts.replace) {
            const existing = await testService.getQuestions(qItem._id);
            for (const q of existing) await testService.deleteQuestion(qItem._id, q._id);
          }
          const res = await contentService.bulkQuestions(questions, { testSeries: qItem._id });
          await reloadTq();
          load("items");
          return res;
        }}
      />

      <AiGenerate
        open={aiOpen}
        title={`Generate with AI — ${qItem?.name || ""}`}
        onClose={() => setAiOpen(false)}
        onUpload={async (questions) => {
          const res = await contentService.bulkQuestions(questions, { testSeries: qItem._id });
          await reloadTq();
          load("items");
          return res;
        }}
      />

      <AiImport
        open={importOpen}
        title={`Import from Web — ${qItem?.name || ""}`}
        onClose={() => setImportOpen(false)}
        onUpload={async (questions) => {
          const res = await contentService.bulkQuestions(questions, { testSeries: qItem._id });
          await reloadTq();
          load("items");
          return res;
        }}
      />

      <DuplicatesModal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        defaultCategory={kind === "quiz" ? "Practice Quiz" : "Practice Test"}
      />

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
  const title = type === "item" ? (kind === "quiz" ? "Quiz" : "Test") : type === "stream" ? "Stream" : type === "topic" ? "Topic" : "Subject";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="my-8 w-full max-w-md animate-scale-in card p-6">
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
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="btn-outline">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save"}</button></div>
      </form>
    </div>
  );
}
