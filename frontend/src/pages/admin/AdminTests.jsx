import { useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, X, CalendarClock } from "lucide-react";
import { adminTests } from "../../data/admin";
import Badge from "../../components/ui/Badge";

const blank = { name: "", questions: 30, marks: 100, duration: 60, schedule: "", status: "draft" };

export default function AdminTests() {
  const [tests, setTests] = useState(adminTests);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);

  const togglePublish = (id) =>
    setTests((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "published" ? "draft" : "published" }
          : t
      )
    );

  const save = (e) => {
    e.preventDefault();
    setTests((ts) => [{ id: `at${Date.now()}`, ...form }, ...ts]);
    setModal(false);
    setForm(blank);
  };

  const statusVariant = (s) =>
    s === "published" ? "brand" : s === "scheduled" ? "accent" : "neutral";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Test Series Management</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Create, schedule and publish full-length & subject tests.
          </p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Create Test
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
            <tr>
              <th className="px-5 py-3 font-semibold">Test Name</th>
              <th className="px-5 py-3 font-semibold">Questions</th>
              <th className="px-5 py-3 font-semibold">Marks</th>
              <th className="px-5 py-3 font-semibold">Duration</th>
              <th className="px-5 py-3 font-semibold">Schedule</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tests.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-5 py-3 font-medium">{t.name}</td>
                <td className="px-5 py-3">{t.questions}</td>
                <td className="px-5 py-3">{t.marks}</td>
                <td className="px-5 py-3">{t.duration} min</td>
                <td className="px-5 py-3">{t.schedule}</td>
                <td className="px-5 py-3"><Badge variant={statusVariant(t.status)}>{t.status}</Badge></td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => togglePublish(t.id)}
                      title={t.status === "published" ? "Unpublish" : "Publish"}
                      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      {t.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setTests((ts) => ts.filter((x) => x.id !== t.id))}
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Create Test Series</h3>
              <button onClick={() => setModal(false)}><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Test Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. JEE Main Full Mock 2" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Questions</label>
                  <input type="number" value={form.questions} onChange={(e) => setForm({ ...form, questions: +e.target.value })} className="input" />
                </div>
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
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
