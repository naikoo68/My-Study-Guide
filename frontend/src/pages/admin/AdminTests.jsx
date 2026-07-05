import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, X, CalendarClock, Users, Search } from "lucide-react";
import { testService } from "../../services";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

const blank = { name: "", category: "Full-Length", marks: 100, duration: 60, schedule: "", status: "draft", difficulty: "Medium" };
const categories = ["Full-Length", "Subject-wise", "Chapter-wise", "Previous Year"];

export default function AdminTests() {
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
    testService
      .adminList()
      .then(setTests)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setForm(blank);
    setEditing(null);
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
      const payload = { ...form };
      if (!payload.schedule) delete payload.schedule;
      if (editing) {
        const updated = await testService.update(editing._id, payload);
        setTests((list) => list.map((x) => (x._id === editing._id ? { ...x, ...updated, questionCount: x.questionCount } : x)));
      } else {
        const created = await testService.create(payload);
        setTests((list) => [{ ...created, questionCount: 0 }, ...list]);
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
          <p className="text-slate-500 dark:text-slate-400">Create, schedule and publish tests.</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="h-4 w-4" /> Create Test
        </button>
      </div>

      {loading ? (
        <Loading label="Loading tests..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tests.length === 0 ? (
        <EmptyState message="No test series yet. Create your first test." />
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
                  <td className="px-5 py-3 font-medium">{t.name}</td>
                  <td className="px-5 py-3">{t.category}</td>
                  <td className="px-5 py-3">{t.questionCount}</td>
                  <td className="px-5 py-3">{t.marks}</td>
                  <td className="px-5 py-3">{t.duration} min</td>
                  <td className="px-5 py-3"><Badge variant={statusVariant(t.status)}>{t.status}</Badge></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => togglePublish(t)}
                        title={t.status === "published" ? "Unpublish" : "Publish"}
                        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        {t.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tip: add questions to this test from the Content section after creating it.
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
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={access.visibleToAll} onChange={(e) => setAccess({ ...access, visibleToAll: e.target.checked })} />
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
    </div>
  );
}
