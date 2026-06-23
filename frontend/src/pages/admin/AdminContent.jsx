import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X, ChevronRight, FolderOpen, Layers, BookOpen, HelpCircle, Image as ImageIcon } from "lucide-react";
import { contentService } from "../../services";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

const COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-teal-600",
];

const emptyQuestion = { text: "", options: ["", "", "", ""], correct: 0, difficulty: "Easy", explanation: "", status: "published", image: "" };

export default function AdminContent() {
  // Drill-down context
  const [view, setView] = useState("subjects"); // subjects | topics | sessions | questions
  const [subject, setSubject] = useState(null);
  const [topic, setTopic] = useState(null);
  const [session, setSession] = useState(null);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { type, mode, data }
  const [saving, setSaving] = useState(false);

  const loaders = {
    subjects: () => contentService.subjects(),
    topics: () => contentService.topics(subject._id),
    sessions: () => contentService.sessions(topic._id),
    questions: () => contentService.questions(session._id),
  };

  const load = useCallback((which) => {
    setLoading(true);
    setError("");
    loaders[which]()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, topic, session]);

  useEffect(() => { load(view); /* eslint-disable-next-line */ }, [view]);

  // Navigation
  const openSubject = (s) => { setSubject(s); setTopic(null); setSession(null); setView("topics"); };
  const openTopic = (t) => { setTopic(t); setSession(null); setView("sessions"); };
  const openSession = (s) => { setSession(s); setView("questions"); };
  const goTo = (level) => setView(level);

  // ---- Save handlers ----
  const save = async (form) => {
    setSaving(true);
    setError("");
    try {
      const { type, mode, data } = modal;
      if (type === "subject") {
        if (mode === "add") await contentService.createSubject(form);
        else await contentService.updateSubject(data._id, form);
      } else if (type === "topic") {
        if (mode === "add") await contentService.createTopic({ ...form, subject: subject._id });
        else await contentService.updateTopic(data._id, form);
      } else if (type === "session") {
        if (mode === "add") await contentService.createSession({ ...form, subject: subject._id, topic: topic._id });
        else await contentService.updateSession(data._id, form);
      } else if (type === "question") {
        if (mode === "add") await contentService.createQuestion({ ...form, subject: subject._id, session: session._id });
        else await contentService.updateQuestion(data._id, form);
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
      if (type === "subject") await contentService.deleteSubject(id);
      else if (type === "topic") await contentService.deleteTopic(id);
      else if (type === "session") await contentService.deleteSession(id);
      else if (type === "question") await contentService.deleteQuestion(id);
      load(view);
    } catch (e) {
      setError(e.message);
    }
  };

  // ---- Breadcrumb ----
  const Crumb = () => (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      <button onClick={() => goTo("subjects")} className={`rounded px-2 py-1 font-medium ${view === "subjects" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>Subjects</button>
      {subject && view !== "subjects" && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("topics")} className={`rounded px-2 py-1 font-medium ${view === "topics" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{subject.name}</button>
      </>)}
      {topic && (view === "sessions" || view === "questions") && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("sessions")} className={`rounded px-2 py-1 font-medium ${view === "sessions" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{topic.title}</button>
      </>)}
      {session && view === "questions" && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <span className="rounded px-2 py-1 font-medium text-brand-600">{session.title}</span>
      </>)}
    </nav>
  );

  const headings = {
    subjects: { title: "Subjects", add: "Add Subject", icon: FolderOpen },
    topics: { title: `Topics in ${subject?.name || ""}`, add: "Add Topic", icon: Layers },
    sessions: { title: `Sessions in ${topic?.title || ""}`, add: "Add Session", icon: BookOpen },
    questions: { title: `Questions in ${session?.title || ""}`, add: "Add Question", icon: HelpCircle },
  };
  const H = headings[view];

  const openAdd = () => setModal({ type: view.slice(0, -1), mode: "add", data: view === "question" ? emptyQuestion : {} });
  const openEdit = (item) => setModal({ type: view.slice(0, -1), mode: "edit", data: item });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Content Management</h1>
          <p className="text-slate-500 dark:text-slate-400">Subject → Topic → Session → Questions. Add, edit or delete at any level.</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="h-4 w-4" /> {H.add}
        </button>
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
          {items.map((item) => (
            <div key={item._id} className="card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                {view === "questions" ? (
                  <>
                    <p className="truncate font-medium">{item.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant={item.difficulty}>{item.difficulty}</Badge>
                      <Badge variant={item.status === "published" ? "brand" : "neutral"}>{item.status}</Badge>
                      <span className="text-xs text-slate-400">Correct: {String.fromCharCode(65 + item.correct)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <H.icon className="h-5 w-5 text-brand-500" />
                      <p className="font-semibold">{item.name || item.title}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {view === "subjects" && `${item.topics ?? 0} topics`}
                      {view === "topics" && `${item.sessions ?? 0} sessions`}
                      {view === "sessions" && `${item.questions ?? 0} questions · ${item.difficulty}`}
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {view !== "questions" && (
                  <button
                    onClick={() => (view === "subjects" ? openSubject(item) : view === "topics" ? openTopic(item) : openSession(item))}
                    className="btn-outline py-2"
                  >
                    Manage <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => openEdit(item)} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(view.slice(0, -1), item._id, item.name || item.title || "this question")} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <FormModal
          modal={modal}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

/* ---------------- Form modal (adapts to subject/topic/session/question) ---------------- */
function FormModal({ modal, saving, onClose, onSave }) {
  const { type, mode, data } = modal;
  const [form, setForm] = useState(() => {
    if (type === "subject") return { name: data.name || "", description: data.description || "", icon: data.icon || "BookOpen", color: data.color || COLORS[0] };
    if (type === "topic") return { title: data.title || "", description: data.description || "", index: data.index || 1 };
    if (type === "session") return { title: data.title || "", difficulty: data.difficulty || "Medium", index: data.index || 1 };
    return { text: data.text || "", options: data.options ? [...data.options] : ["", "", "", ""], correct: data.correct ?? 0, difficulty: data.difficulty || "Easy", explanation: data.explanation || "", status: data.status || "published", image: data.image || "" };
  });

  const titleMap = { subject: "Subject", topic: "Topic", session: "Session", question: "Question" };
  const submit = (e) => { e.preventDefault(); onSave(form); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <form onSubmit={submit} className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{mode === "add" ? "Add" : "Edit"} {titleMap[type]}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          {type === "subject" && (
            <>
              <Field label="Name"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Physics" /></Field>
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

          {type === "question" && (
            <>
              <Field label="Question Text"><textarea required rows={2} className="input resize-none" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
              <Field label="Image URL (optional)">
                <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 dark:border-slate-700">
                  <ImageIcon className="h-4 w-4 text-slate-400" />
                  <input className="w-full bg-transparent py-2.5 text-sm focus:outline-none" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="https://res.cloudinary.com/..." />
                </div>
              </Field>
              <Field label="Options (select the correct one)">
                <div className="space-y-2">
                  {form.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="radio" name="correct" checked={form.correct === i} onChange={() => setForm({ ...form, correct: i })} className="h-4 w-4 text-brand-600" />
                      <input required className="input" value={opt} onChange={(e) => { const o = [...form.options]; o[i] = e.target.value; setForm({ ...form, options: o }); }} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
                    </div>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Difficulty">
                  <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="published">Published</option><option value="draft">Draft</option>
                  </select>
                </Field>
              </div>
              <Field label="Explanation / Solution"><textarea rows={2} className="input resize-none" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></Field>
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
