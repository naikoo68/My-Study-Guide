import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, X, CalendarClock, Users, Search, Upload, HelpCircle, ChevronRight, GraduationCap, Briefcase, Copy, Download, Sparkles, Globe, Library, Clock, Scale, Shuffle } from "lucide-react";
import { questionDateText, searchQuestions } from "../../lib/questions";
import { testService, contentService, examService, practiceService } from "../../services";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import BulkUploadQuestions, { questionsToCsv } from "../../components/admin/BulkUploadQuestions";
import AiGenerate from "../../components/admin/AiGenerate";
import AiImport from "../../components/admin/AiImport";
import SubjectPlanEditor from "../../components/admin/SubjectPlanEditor";
import PickFromBank from "../../components/admin/PickFromBank";
import WeightageFill from "../../components/admin/WeightageFill";
import ConvertModal from "../../components/admin/ConvertModal";
import DuplicatesModal from "../../components/admin/DuplicatesModal";
import { Files } from "lucide-react";
import QuestionFormModal from "../../components/admin/QuestionFormModal";
import QuestionView from "../../components/admin/QuestionView";

const blank = { name: "", category: "Full-Length", marks: 100, duration: 60, schedule: "", status: "draft", difficulty: "Medium" };
const categories = ["Full-Length", "Subject-wise", "Chapter-wise", "Previous Year"];
// Subject names from a test's typed plan (for the "Add to subject" selectors).
const sectionsOf = (t) => (t?.subjectPlan || []).map((p) => p.subject).filter(Boolean);

export default function AdminTests() {
  // Drill-down: exams → posts → tests
  const [view, setView] = useState("exams"); // exams | posts | tests
  const [exam, setExam] = useState(null);
  const [post, setPost] = useState(null);
  const [list, setList] = useState([]); // exams or posts at the current level

  // Exam/Post add-edit modal
  const [epModal, setEpModal] = useState(null); // { type: "exam"|"post", mode, data }
  const [epForm, setEpForm] = useState({ name: "", description: "", order: 1 });
  const [epSaving, setEpSaving] = useState(false);

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  // "Manage access" panel (per-user visibility & validity for a test)
  const [accessTest, setAccessTest] = useState(null);
  const [access, setAccess] = useState(null); // { visibleToAll, users: [...] }
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Bulk-upload-questions-to-a-test state
  const [bulkTest, setBulkTest] = useState(null);
  const [aiTest, setAiTest] = useState(null); // AI-generate questions for a test
  const [importTest, setImportTest] = useState(null); // import-from-web questions for a test
  const [bankTest, setBankTest] = useState(null); // manual pick-from-bank for a test
  const [weightTest, setWeightTest] = useState(null); // auto-fill by subject (weightage)
  const [convertTest, setConvertTest] = useState(null); // convert Test Series → My Test
  const [dupTest, setDupTest] = useState(null); // find-duplicates within a test

  // Manual subject plan (typed) for the create/edit popup
  const [composition, setComposition] = useState([]);

  // Manage-questions state
  const [qTest, setQTest] = useState(null); // test whose questions we're editing
  const [tq, setTq] = useState([]); // its questions
  const [tqLoading, setTqLoading] = useState(false);
  const [tqModal, setTqModal] = useState(null); // { mode, data }
  const [tqSaving, setTqSaving] = useState(false);
  const [viewQ, setViewQ] = useState(null); // single question preview
  const [viewAllQ, setViewAllQ] = useState(false); // all questions preview
  const [selectedTq, setSelectedTq] = useState([]); // bulk-selected question ids
  const [tqSearch, setTqSearch] = useState(""); // question search query

  const toggleTqSelect = (id) => setSelectedTq((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allTqSelected = tq.length > 0 && selectedTq.length === tq.length;
  const toggleAllTq = () => setSelectedTq(allTqSelected ? [] : tq.map((x) => x._id));
  const tqResults = searchQuestions(tq, tqSearch); // 40%+ matches (null when not searching)
  const shownTq = tqResults || tq;
  const deleteSelectedTq = async () => {
    if (!selectedTq.length) return;
    if (!window.confirm(`Delete ${selectedTq.length} selected question(s)? This cannot be undone.`)) return;
    try {
      for (const id of selectedTq) await testService.deleteQuestion(qTest._id, id);
      setSelectedTq([]);
      await reloadTq();
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const openQuestions = async (t) => {
    setQTest(t);
    setTq([]);
    setSelectedTq([]);
    setTqSearch("");
    setTqLoading(true);
    try {
      setTq(await testService.getQuestions(t._id));
    } catch (e) {
      setError(e.message);
      setQTest(null);
    } finally {
      setTqLoading(false);
    }
  };

  const reloadTq = async () => {
    try { setTq(await testService.getQuestions(qTest._id)); } catch { /* ignore */ }
  };

  // Copy a test's questions as CSV text to the clipboard.
  const copyCsv = async (questions) => {
    if (!questions?.length) return;
    try {
      await navigator.clipboard.writeText(questionsToCsv(questions));
      window.alert(`Copied ${questions.length} question(s) as CSV to the clipboard.`);
    } catch {
      window.alert("Couldn't access the clipboard — use “Download CSV” instead.");
    }
  };

  // Download a test's questions as a .csv file.
  const downloadCsv = (questions, name) => {
    if (!questions?.length) return;
    const url = URL.createObjectURL(new Blob([questionsToCsv(questions)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(name || "test").replace(/[^\w-]+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const saveTestQuestion = async (payload) => {
    setTqSaving(true);
    try {
      if (tqModal.mode === "add") await testService.addQuestion(qTest._id, payload);
      else await contentService.updateQuestion(tqModal.data._id, payload);
      await reloadTq();
      load(); // refresh question counts in the table
      setTqModal(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setTqSaving(false);
    }
  };

  const removeTq = async (qid) => {
    if (!window.confirm("Delete this question from the test?")) return;
    try {
      await testService.deleteQuestion(qTest._id, qid);
      await reloadTq();
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const openAccess = async (t) => {
    setAccessTest(t);
    setAccess(null);
    setUserSearch("");
    setAccessLoading(true);
    try {
      setAccess(await testService.getAccess(t._id));
    } catch (e) {
      setError(e.message);
      setAccessTest(null);
    } finally {
      setAccessLoading(false);
    }
  };

  const saveAccess = async () => {
    if (!access) return;
    setAccessSaving(true);
    try {
      await testService.updateAccess(accessTest._id, {
        visibleToAll: access.visibleToAll,
        users: access.users.map((u) => ({ user: u._id, visible: u.visible, validUntil: u.validUntil })),
      });
      setAccessTest(null);
      setAccess(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setAccessSaving(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError("");
    const req =
      view === "exams"
        ? examService.exams().then(setList)
        : view === "posts"
        ? examService.posts(exam._id).then(setList)
        : testService.adminList(post?._id).then(setTests);
    req.catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  // Reload whenever the drill-down level changes.
  useEffect(load, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation
  const openExam = (e) => { setExam(e); setPost(null); setView("posts"); };
  const openPost = (p) => { setPost(p); setView("tests"); };
  const goTo = (level) => setView(level);

  // Exam / Post add-edit
  const openEpAdd = () => {
    setEpForm({ name: "", description: "", order: 1 });
    setEpModal({ type: view === "exams" ? "exam" : "post", mode: "add" });
  };
  const openEpEdit = (item) => {
    setEpForm({ name: item.name, description: item.description || "", order: item.order || 1 });
    setEpModal({ type: view === "exams" ? "exam" : "post", mode: "edit", data: item });
  };
  const saveEp = async (e) => {
    e.preventDefault();
    setEpSaving(true);
    try {
      const { type, mode, data } = epModal;
      if (type === "exam") {
        if (mode === "add") await examService.createExam(epForm);
        else await examService.updateExam(data._id, epForm);
      } else {
        if (mode === "add") await examService.createPost({ ...epForm, exam: exam._id });
        else await examService.updatePost(data._id, epForm);
      }
      setEpModal(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setEpSaving(false);
    }
  };
  const removeEp = async (item) => {
    const isExam = view === "exams";
    if (!window.confirm(`Delete "${item.name}"? ${isExam ? "Its posts are removed and its tests detached." : "Its tests are detached."}`)) return;
    try {
      if (isExam) await examService.deleteExam(item._id);
      else await examService.deletePost(item._id);
      setList((l) => l.filter((x) => x._id !== item._id));
    } catch (e) {
      setError(e.message);
    }
  };

  const openCreate = () => {
    setForm(blank);
    setEditing(null);
    setComposition([]);
    setModal(true);
  };

  const openEdit = (t) => {
    setForm({
      name: t.name,
      category: t.category,
      marks: t.marks,
      duration: t.duration,
      difficulty: t.difficulty || "Medium",
      status: t.status,
      schedule: t.schedule ? new Date(t.schedule).toISOString().slice(0, 10) : "",
    });
    setComposition((t.subjectPlan || []).map((r) => ({ subject: r.subject || "", count: r.count ?? 0 })));
    setEditing(t);
    setModal(true);
  };

  const togglePublish = async (t) => {
    try {
      const res = await testService.togglePublish(t._id);
      setTests((list) => list.map((x) => (x._id === t._id ? { ...x, status: res.status } : x)));
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this test series?")) return;
    try {
      await testService.remove(id);
      setTests((list) => list.filter((x) => x._id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Manual subject blueprint (typed) — saved as a plan/guide, no auto-pull.
      const subjectPlan = composition
        .filter((r) => r.subject?.trim())
        .map((r) => ({ subject: r.subject.trim(), count: parseInt(r.count, 10) || 0 }));
      const payload = { ...form, subjectPlan };
      if (!payload.schedule) delete payload.schedule;
      if (editing) {
        const updated = await testService.update(editing._id, payload);
        setTests((prev) => prev.map((x) => (x._id === editing._id ? { ...x, ...updated, questionCount: x.questionCount } : x)));
      } else {
        // New tests belong to the current exam + post. Add questions afterwards
        // (manually, from the bank / bulk / one-by-one).
        const created = await testService.create({ ...payload, exam: exam?._id, post: post?._id });
        setTests((prev) => [{ ...created, questionCount: 0 }, ...prev]);
      }
      setModal(false);
      setForm(blank);
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusVariant = (s) => (s === "published" ? "brand" : s === "scheduled" ? "accent" : "neutral");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Test Series Management</h1>
          <p className="text-slate-500 dark:text-slate-400">Exam → Post → Category → Tests. Manage each level here.</p>
        </div>
        {view === "tests" ? (
          <button onClick={openCreate} className="btn-primary"><Plus className="h-4 w-4" /> Create Test</button>
        ) : (
          <button onClick={openEpAdd} className="btn-primary"><Plus className="h-4 w-4" /> {view === "exams" ? "Add Exam" : "Add Post"}</button>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="card px-4 py-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <button onClick={() => goTo("exams")} className={`rounded px-2 py-1 font-medium ${view === "exams" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>Exams</button>
          {exam && view !== "exams" && (<>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <button onClick={() => goTo("posts")} className={`rounded px-2 py-1 font-medium ${view === "posts" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{exam.name}</button>
          </>)}
          {post && view === "tests" && (<>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="rounded px-2 py-1 font-medium text-brand-600">{post.name}</span>
          </>)}
        </nav>
      </div>

      {loading ? (
        <Loading label={`Loading ${view}...`} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : view !== "tests" ? (
        list.length === 0 ? (
          <EmptyState message={view === "exams" ? 'No exams yet. Click "Add Exam".' : 'No posts yet. Click "Add Post".'} />
        ) : (
          <div className="space-y-3">
            {list.map((item) => (
              <div key={item._id} className="card flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                    {view === "exams" ? <GraduationCap className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-slate-400">{view === "exams" ? `${item.posts ?? 0} posts` : `${item.tests ?? 0} tests`}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button onClick={() => (view === "exams" ? openExam(item) : openPost(item))} className="btn-outline py-2">Manage <ChevronRight className="h-4 w-4" /></button>
                  <button onClick={() => openEpEdit(item)} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => removeEp(item)} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tests.length === 0 ? (
        <EmptyState message="No tests in this post yet. Click Create Test, or use Bulk Upload after creating one." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
              <tr>
                <th className="px-5 py-3 font-semibold">Test Name</th>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Questions</th>
                <th className="px-5 py-3 font-semibold">Marks</th>
                <th className="px-5 py-3 font-semibold">Duration</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tests.map((t) => (
                <tr key={t._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3">
                    <button onClick={() => openQuestions(t)} title="Open test — view, edit, add or remove questions" className="text-left font-medium text-brand-600 hover:underline dark:text-brand-400">
                      {t.name}
                    </button>
                  </td>
                  <td className="px-5 py-3">{t.category}</td>
                  <td className="px-5 py-3">{t.questionCount}</td>
                  <td className="px-5 py-3">{t.marks}</td>
                  <td className="px-5 py-3">{t.duration} min</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                      <span className={`text-[10px] font-semibold ${t.visibleToAll ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {t.visibleToAll ? "Visible to all" : "Restricted"}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => togglePublish(t)}
                        title={t.status === "published" ? "Unpublish" : "Publish"}
                        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        {t.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button onClick={() => openQuestions(t)} title="Manage questions" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <HelpCircle className="h-4 w-4" />
                      </button>
                      <button onClick={() => setBulkTest(t)} title="Bulk upload questions" className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">
                        <Upload className="h-4 w-4" />
                      </button>
                      <button onClick={() => setAiTest(t)} title="Generate questions with AI" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Sparkles className="h-4 w-4" />
                      </button>
                      <button onClick={() => setImportTest(t)} title="Import questions from web" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Globe className="h-4 w-4" />
                      </button>
                      <button onClick={() => setBankTest(t)} title="Add questions from quizzes / practice (hand-pick)" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Library className="h-4 w-4" />
                      </button>
                      <button onClick={() => setWeightTest(t)} title="Add by subject (weightage) — auto-pull N questions per subject" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Scale className="h-4 w-4" />
                      </button>
                      <button onClick={() => setConvertTest(t)} title="Move to My Test (practice)" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Shuffle className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDupTest(t)} title="Find duplicate questions in this test" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Files className="h-4 w-4" />
                      </button>
                      <button onClick={() => openAccess(t)} title="Manage user access" className="rounded-lg p-2 text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-900/30">
                        <Users className="h-4 w-4" />
                      </button>
                      <button onClick={() => openEdit(t)} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => remove(t._id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit Exam or Post */}
      {epModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={saveEp} className="my-8 w-full max-w-md animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{epModal.mode === "add" ? "Add" : "Edit"} {epModal.type === "exam" ? "Exam" : "Post"}</h3>
              <button type="button" onClick={() => setEpModal(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">{epModal.type === "exam" ? "Exam name" : "Post name"}</label>
                <input required className="input" value={epForm.name} onChange={(e) => setEpForm({ ...epForm, name: e.target.value })} placeholder={epModal.type === "exam" ? "e.g. JKSSB" : "e.g. Finance Account Assistant"} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Description (optional)</label>
                <textarea rows={2} className="input resize-none" value={epForm.description} onChange={(e) => setEpForm({ ...epForm, description: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Order</label>
                <input type="number" className="input" value={epForm.order} onChange={(e) => setEpForm({ ...epForm, order: +e.target.value })} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setEpModal(null)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={epSaving} className="btn-primary">{epSaving ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editing ? "Edit Test Series" : "Create Test Series"}</h3>
              <button onClick={() => setModal(false)}><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Test Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. JEE Main Full Mock 2" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                    {categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Difficulty</label>
                  <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className="input">
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Marks</label>
                  <input type="number" value={form.marks} onChange={(e) => setForm({ ...form, marks: +e.target.value })} className="input" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Duration (min)</label>
                  <input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: +e.target.value })} className="input" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Schedule Date</label>
                  <div className="relative">
                    <CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input type="date" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} className="input pl-9" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <label className="mb-1 block text-sm font-semibold">Subjects &amp; questions per subject (optional)</label>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Type your subjects and how many questions each — this is a plan/guide for the test. You add the actual
                  questions afterwards.
                </p>
                <SubjectPlanEditor rows={composition} onChange={setComposition} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                After creating, add questions with <b>Add from Quizzes/Practice</b> (hand-pick), <b>Manage questions</b>
                (one by one), <b>Bulk upload</b>, <b>Generate with AI</b>, or <b>Import from Web</b> on the test row.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-outline">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : editing ? "Save Changes" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage user access modal */}
      {accessTest && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg animate-scale-in card p-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold">User Access</h3>
              <button type="button" onClick={() => setAccessTest(null)}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{accessTest.name}</p>

            {accessLoading || !access ? (
              <Loading label="Loading users..." />
            ) : (
              <div className="space-y-4">
                {/* Visible-to-all master toggle */}
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div>
                    <p className="text-sm font-medium">Visible to everyone by default</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">When off, only users marked visible below can see this test.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={access.visibleToAll}
                    onChange={(e) => {
                      const on = e.target.checked;
                      // Reflect the master toggle on every user row (select / deselect all).
                      setAccess({ ...access, visibleToAll: on, users: access.users.map((u) => ({ ...u, visible: on })) });
                    }}
                  />
                </label>

                {access.users.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">No student accounts yet.</p>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..." className="input pl-9" />
                    </div>
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {access.users
                        .filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
                        .map((u) => {
                          const i = access.users.indexOf(u);
                          return (
                            <div key={u._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{u.name}</p>
                                  <p className="truncate text-xs text-slate-400">{u.email}</p>
                                </div>
                                <label className="inline-flex flex-shrink-0 cursor-pointer items-center gap-2 text-xs font-medium">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-accent-600"
                                    checked={u.visible}
                                    onChange={(e) => setAccess({ ...access, users: access.users.map((x, xi) => xi === i ? { ...x, visible: e.target.checked } : x) })}
                                  />
                                  {u.visible ? "Visible" : "Hidden"}
                                </label>
                              </div>
                              {u.visible && (
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">Valid until</span>
                                  <input
                                    type="date"
                                    className="input h-8 py-1 text-xs"
                                    value={u.validUntil ? new Date(u.validUntil).toISOString().slice(0, 10) : ""}
                                    onChange={(e) => setAccess({ ...access, users: access.users.map((x, xi) => xi === i ? { ...x, validUntil: e.target.value ? new Date(e.target.value).toISOString() : null } : x) })}
                                  />
                                  {u.validUntil ? (
                                    <button type="button" onClick={() => setAccess({ ...access, users: access.users.map((x, xi) => xi === i ? { ...x, validUntil: null } : x) })} className="text-xs text-slate-400 hover:text-rose-600">clear</button>
                                  ) : (
                                    <span className="text-xs text-slate-400">(no limit)</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setAccessTest(null)} className="btn-outline">Cancel</button>
                  <button type="button" onClick={saveAccess} disabled={accessSaving} className="btn-primary">{accessSaving ? "Saving..." : "Save Access"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <BulkUploadQuestions
        open={!!bulkTest}
        title={`Bulk Upload Questions${bulkTest ? ` — ${bulkTest.name}` : ""}`}
        sections={sectionsOf(bulkTest)}
        onClose={() => setBulkTest(null)}
        onUpload={async (questions, opts = {}) => {
          if (opts.replace) {
            const existing = await testService.getQuestions(bulkTest._id);
            for (const q of existing) await testService.deleteQuestion(bulkTest._id, q._id);
          }
          const res = await contentService.bulkQuestions(questions, { testSeries: bulkTest._id, section: opts.section || "" });
          load(); // refresh question counts
          return res;
        }}
      />

      <AiGenerate
        open={!!aiTest}
        title={`Generate with AI${aiTest ? ` — ${aiTest.name}` : ""}`}
        sections={sectionsOf(aiTest)}
        onClose={() => setAiTest(null)}
        onUpload={async (questions, opts = {}) => {
          const res = await contentService.bulkQuestions(questions, { testSeries: aiTest._id, section: opts.section || "" });
          load(); // refresh question counts
          return res;
        }}
      />

      <AiImport
        open={!!importTest}
        title={`Import from Web${importTest ? ` — ${importTest.name}` : ""}`}
        sections={sectionsOf(importTest)}
        onClose={() => setImportTest(null)}
        onUpload={async (questions, opts = {}) => {
          const res = await contentService.bulkQuestions(questions, { testSeries: importTest._id, section: opts.section || "" });
          load();
          return res;
        }}
      />

      <PickFromBank
        open={!!bankTest}
        testId={bankTest?._id}
        plan={bankTest?.subjectPlan || []}
        title={`Add from Quizzes / Practice${bankTest ? ` — ${bankTest.name}` : ""}`}
        onClose={() => setBankTest(null)}
        onDone={() => load()}
      />

      <WeightageFill
        open={!!weightTest}
        testId={weightTest?._id}
        includeQuizBank
        title={`Add by subject (weightage)${weightTest ? ` — ${weightTest.name}` : ""}`}
        onClose={() => setWeightTest(null)}
        onDone={() => load()}
      />

      <ConvertModal
        open={!!convertTest}
        mode="toMyTest"
        source={convertTest}
        onClose={() => setConvertTest(null)}
        onDone={() => { setConvertTest(null); load(); }}
      />

      <DuplicatesModal
        open={!!dupTest}
        scope={dupTest ? { testSeries: dupTest._id } : null}
        scopeName={dupTest?.name || ""}
        hideSubjectPicker
        onClose={() => { setDupTest(null); load(); if (qTest) reloadTq(); }}
      />

      {/* Manage questions modal */}
      {qTest && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-2xl animate-scale-in card p-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold">Questions</h3>
              <button onClick={() => setQTest(null)}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{qTest.name}</p>

            {/* Per-subject progress: added vs planned vs remaining */}
            {(qTest.subjectPlan?.length > 0 || tq.some((q) => !q.section)) && (
              <div className="mb-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-2 text-sm font-semibold">Questions by subject</p>
                <div className="space-y-1.5">
                  {(qTest.subjectPlan || []).map((p, i) => {
                    const added = tq.filter((q) => (q.section || "") === p.subject).length;
                    const planned = p.count || 0;
                    const remaining = Math.max(0, planned - added);
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{p.subject}</span>
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{added} added</span>
                          {planned > 0 && (
                            <>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-800">{planned} planned</span>
                              <span className={`rounded px-1.5 py-0.5 font-semibold ${remaining > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>
                                {remaining} remaining
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {tq.some((q) => !q.section) && (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-400">Unassigned</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800">{tq.filter((q) => !q.section).length} added</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mb-4 flex flex-wrap justify-end gap-2">
              {tq.length > 0 && (
                <>
                  <button onClick={() => setViewAllQ(true)} className="btn-outline">
                    <Eye className="h-4 w-4" /> View All
                  </button>
                  <button onClick={() => copyCsv(selectedTq.length ? tq.filter((q) => selectedTq.includes(q._id)) : tq)} className="btn-outline">
                    <Copy className="h-4 w-4" /> Copy CSV{selectedTq.length ? ` (${selectedTq.length})` : ""}
                  </button>
                  <button onClick={() => downloadCsv(selectedTq.length ? tq.filter((q) => selectedTq.includes(q._id)) : tq, qTest?.name || "test")} className="btn-outline">
                    <Download className="h-4 w-4" /> Download CSV{selectedTq.length ? ` (${selectedTq.length})` : ""}
                  </button>
                </>
              )}
              {tq.length > 0 && (
                <button onClick={() => setDupTest(qTest)} className="btn-outline">
                  <Files className="h-4 w-4" /> Find Duplicates
                </button>
              )}
              <button onClick={() => setTqModal({ mode: "add", data: null })} className="btn-primary">
                <Plus className="h-4 w-4" /> Add Question
              </button>
            </div>

            {tqLoading ? (
              <Loading label="Loading questions..." />
            ) : tq.length === 0 ? (
              <EmptyState message="No questions yet. Add one, or use Bulk Upload." />
            ) : (
              <>
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input value={tqSearch} onChange={(e) => setTqSearch(e.target.value)} placeholder="Search questions…  (shows matches 40%–100%)" className="w-full bg-transparent text-sm outline-none" />
                {tqSearch && <button onClick={() => setTqSearch("")} title="Clear" className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>}
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={allTqSelected} onChange={toggleAllTq} className="h-4 w-4 accent-brand-600" /> Select all
                </label>
                {tqResults && <span className="text-sm font-medium text-slate-500">{tqResults.length} match{tqResults.length === 1 ? "" : "es"} (40%+)</span>}
                {selectedTq.length > 0 && (
                  <>
                    <span className="text-sm text-slate-500">{selectedTq.length} selected</span>
                    <button onClick={deleteSelectedTq} className="btn-outline py-1.5 text-rose-600"><Trash2 className="h-4 w-4" /> Delete selected</button>
                    <button onClick={() => setSelectedTq([])} className="text-sm text-slate-500 hover:underline">Clear</button>
                  </>
                )}
              </div>
              {tqResults && tqResults.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">No questions match “{tqSearch}” at 40%+.</p>
              )}
              <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                {shownTq.map((item, i) => (
                  <div key={item._id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex min-w-0 items-start gap-2">
                      <input type="checkbox" checked={selectedTq.includes(item._id)} onChange={() => toggleTqSelect(item._id)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-600" />
                      <div className="min-w-0">
                      <p className="truncate text-sm font-medium"><span className="text-slate-400">Q{i + 1}.</span> {item.text}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {item._match != null && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{item._match}% match</span>
                        )}
                        {item.section && <Badge variant="accent">{item.section}</Badge>}
                        <Badge variant={item.type === "matching" ? "accent" : "brand"}>{item.type === "matching" ? "Matching" : "MCQ"}</Badge>
                        <Badge variant={item.difficulty}>{item.difficulty}</Badge>
                        {item.status && <Badge variant={item.status === "published" ? "brand" : "neutral"}>{item.status}</Badge>}
                        {item.correct !== undefined && (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Correct: {String.fromCharCode(65 + item.correct)}</span>
                        )}
                        {questionDateText(item) && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" /> {questionDateText(item)}</span>
                        )}
                      </div>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      <button onClick={() => setViewQ(item)} title="View" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => setTqModal({ mode: "edit", data: item })} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => removeTq(item._id)} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}

            <div className="mt-6 flex justify-end">
              <button onClick={() => setQTest(null)} className="btn-outline">Close</button>
            </div>
          </div>
        </div>
      )}

      {tqModal && (
        <QuestionFormModal
          key={tqModal.mode === "edit" ? tqModal.data?._id : "new-test-question"}
          question={tqModal.mode === "edit" ? tqModal.data : null}
          saving={tqSaving}
          sections={sectionsOf(qTest)}
          onClose={() => setTqModal(null)}
          onSave={saveTestQuestion}
        />
      )}

      {/* View single test question */}
      {viewQ && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewQ(null)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Question</h3>
              <button onClick={() => setViewQ(null)}><X className="h-5 w-5" /></button>
            </div>
            <QuestionView q={viewQ} />
          </div>
        </div>
      )}

      {/* View all test questions */}
      {viewAllQ && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewAllQ(false)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-3xl animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">All questions{qTest ? ` — ${qTest.name}` : ""} ({tq.length})</h3>
              <button onClick={() => setViewAllQ(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {tq.map((it, i) => (
                <div key={it._id} className="relative rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    <button onClick={() => { setViewAllQ(false); setTqModal({ mode: "edit", data: it }); }} title="Edit" className="rounded-lg bg-white p-1.5 text-brand-600 shadow hover:bg-brand-50 dark:bg-slate-800 dark:hover:bg-brand-900/30">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => removeTq(it._id)} title="Delete" className="rounded-lg bg-white p-1.5 text-rose-600 shadow hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-900/30">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <QuestionView q={it} index={i + 1} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
