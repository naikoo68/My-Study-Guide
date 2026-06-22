import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Image as ImageIcon,
  X,
  Search,
  FileSpreadsheet,
} from "lucide-react";
import { subjects } from "../../data/subjects";
import { adminQuestions } from "../../data/admin";
import Badge from "../../components/ui/Badge";

const tabs = ["Subjects", "Questions"];

const blankQuestion = {
  subject: "Physics",
  session: "",
  text: "",
  options: ["", "", "", ""],
  correct: 0,
  difficulty: "Easy",
  explanation: "",
};

export default function AdminContent() {
  const [tab, setTab] = useState("Questions");
  const [questions, setQuestions] = useState(adminQuestions);
  const [subjectList, setSubjectList] = useState(
    subjects.map((s) => ({ id: s.id, name: s.name, chapters: s.chapters }))
  );
  const [modal, setModal] = useState(null); // 'question' | 'subject' | 'bulk'
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankQuestion);
  const [search, setSearch] = useState("");

  const openAddQuestion = () => {
    setForm(blankQuestion);
    setEditing(null);
    setModal("question");
  };
  const openEditQuestion = (q) => {
    setForm({ ...blankQuestion, ...q });
    setEditing(q.id);
    setModal("question");
  };
  const saveQuestion = (e) => {
    e.preventDefault();
    if (editing) {
      setQuestions((qs) => qs.map((q) => (q.id === editing ? { ...q, ...form } : q)));
    } else {
      setQuestions((qs) => [
        { id: `q${Date.now()}`, status: "draft", ...form },
        ...qs,
      ]);
    }
    setModal(null);
  };
  const deleteQuestion = (id) =>
    setQuestions((qs) => qs.filter((q) => q.id !== id));

  const filteredQ = questions.filter(
    (q) =>
      q.text.toLowerCase().includes(search.toLowerCase()) ||
      q.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Content Management</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Manage subjects, sessions, quizzes and questions.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal("bulk")} className="btn-outline">
            <Upload className="h-4 w-4" /> Bulk Upload
          </button>
          {tab === "Questions" ? (
            <button onClick={openAddQuestion} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Question
            </button>
          ) : (
            <button
              onClick={() => {
                setSubjectList((s) => [
                  { id: `s${Date.now()}`, name: "New Subject", chapters: 0 },
                  ...s,
                ]);
              }}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" /> Add Subject
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Subjects" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
              <tr>
                <th className="px-5 py-3 font-semibold">Subject</th>
                <th className="px-5 py-3 font-semibold">Sessions</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {subjectList.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3 font-medium">{s.name}</td>
                  <td className="px-5 py-3">{s.chapters} sessions</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setSubjectList((l) => l.filter((x) => x.id !== s.id))}
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                      >
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

      {tab === "Questions" && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions..."
              className="input pl-9"
            />
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
                <tr>
                  <th className="px-5 py-3 font-semibold">Question</th>
                  <th className="px-5 py-3 font-semibold">Subject</th>
                  <th className="px-5 py-3 font-semibold">Difficulty</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredQ.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="max-w-xs px-5 py-3">
                      <p className="truncate font-medium">{q.text}</p>
                      <p className="text-xs text-slate-400">{q.session}</p>
                    </td>
                    <td className="px-5 py-3">{q.subject}</td>
                    <td className="px-5 py-3"><Badge variant={q.difficulty}>{q.difficulty}</Badge></td>
                    <td className="px-5 py-3">
                      <Badge variant={q.status === "published" ? "brand" : "neutral"}>
                        {q.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEditQuestion(q)} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteQuestion(q.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Question modal */}
      {modal === "question" && (
        <Modal title={editing ? "Edit Question" : "Add Question"} onClose={() => setModal(null)}>
          <form onSubmit={saveQuestion} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Subject</label>
                <select
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="input"
                >
                  {subjects.map((s) => (
                    <option key={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Session / Chapter</label>
                <input
                  value={form.session}
                  onChange={(e) => setForm({ ...form, session: e.target.value })}
                  className="input"
                  placeholder="e.g. Motion"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Question Text</label>
              <textarea
                required
                rows={2}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                className="input resize-none"
                placeholder="Enter the question..."
              />
            </div>

            {/* Image upload */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Question Image (optional)</label>
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
                <div>
                  <ImageIcon className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2">Drag & drop or click to upload (Cloudinary)</p>
                  <input type="file" accept="image/*" className="mt-2 text-xs" />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Options (select the correct one)</label>
              <div className="space-y-2">
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={form.correct === i}
                      onChange={() => setForm({ ...form, correct: i })}
                      className="h-4 w-4 text-brand-600"
                    />
                    <input
                      value={opt}
                      onChange={(e) => {
                        const opts = [...form.options];
                        opts[i] = e.target.value;
                        setForm({ ...form, options: opts });
                      }}
                      className="input"
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Difficulty</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                  className="input"
                >
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Explanation / Solution</label>
              <textarea
                rows={2}
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                className="input resize-none"
                placeholder="Explain the correct answer..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-outline">Cancel</button>
              <button type="submit" className="btn-primary">Save Question</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bulk upload modal */}
      {modal === "bulk" && (
        <Modal title="Bulk Upload Questions" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
              <div>
                <FileSpreadsheet className="mx-auto h-10 w-10 text-emerald-500" />
                <p className="mt-3 font-medium">Upload CSV or Excel file</p>
                <p className="text-sm text-slate-500">Columns: subject, session, question, optionA-D, correct, difficulty, explanation</p>
                <input type="file" accept=".csv,.xlsx,.xls" className="mt-3 text-xs" />
              </div>
            </div>
            <a href="#" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              Download sample template →
            </a>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setModal(null)} className="btn-outline">Cancel</button>
              <button onClick={() => setModal(null)} className="btn-primary">
                <Upload className="h-4 w-4" /> Import
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
