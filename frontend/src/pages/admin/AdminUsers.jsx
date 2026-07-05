import { useEffect, useState } from "react";
import { Search, Ban, CheckCircle2, KeyRound, Crown, UserPlus, Pencil, Trash2, X } from "lucide-react";
import { userService } from "../../services";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

const blankUser = { name: "", email: "", password: "", role: "student", plan: "Free" };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankUser);
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm(blankUser); setEditing(null); setError(""); setModal(true); };
  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, password: "", role: u.role, plan: u.plan });
    setEditing(u);
    setError("");
    setModal(true);
  };

  const load = () => {
    setLoading(true);
    setError("");
    userService
      .list()
      .then((res) => setUsers(res.users || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  };

  const toggleBlock = async (u) => {
    try {
      const res = await userService.toggleStatus(u._id);
      setUsers((list) => list.map((x) => (x._id === u._id ? { ...x, status: res.status } : x)));
    } catch (e) {
      flash(e.message);
    }
  };

  const resetPassword = async (u) => {
    try {
      await userService.resetPassword(u._id);
      flash(`Password reset link issued for ${u.name}.`);
    } catch (e) {
      flash(e.message);
    }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    try {
      await userService.remove(u._id);
      setUsers((list) => list.filter((x) => x._id !== u._id));
      flash("User deleted.");
    } catch (e) {
      flash(e.message);
    }
  };

  const saveUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        const payload = { name: form.name, email: form.email, role: form.role, plan: form.plan };
        if (form.password) payload.password = form.password; // only change if provided
        const updated = await userService.update(editing._id, payload);
        setUsers((list) => list.map((x) => (x._id === editing._id ? { ...x, ...updated } : x)));
        flash("User updated.");
      } else {
        const created = await userService.create(form);
        setUsers((list) => [created, ...list]);
        flash("User created.");
      }
      setModal(false);
      setForm(blankUser);
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const planVariant = (p) => (p === "Premium" ? "brand" : p === "Pro" ? "accent" : "neutral");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">User Management</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Add, delete, block/unblock, reset passwords and manage subscriptions.
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <UserPlus className="h-4 w-4" /> Add User
        </button>
      </div>

      {loading ? (
        <Loading label="Loading users..." />
      ) : error && !modal ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { l: "Total Users", v: users.length, c: "text-brand-600" },
              { l: "Active", v: users.filter((u) => u.status === "active").length, c: "text-emerald-600" },
              { l: "Blocked", v: users.filter((u) => u.status === "blocked").length, c: "text-rose-600" },
            ].map((s) => (
              <div key={s.l} className="card p-5 text-center">
                <p className={`text-3xl font-extrabold ${s.c}`}>{s.v}</p>
                <p className="mt-1 text-sm text-slate-500">{s.l}</p>
              </div>
            ))}
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="input pl-9" />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                          {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </span>
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={planVariant(u.plan)}>
                        {u.plan !== "Free" && <Crown className="h-3 w-3" />} {u.plan}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={u.status === "active" ? "Easy" : "Hard"}>{u.status}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(u)} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => resetPassword(u)} title="Reset password" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleBlock(u)}
                          title={u.status === "blocked" ? "Unblock" : "Block"}
                          className={`rounded-lg p-2 ${u.status === "blocked" ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30" : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30"}`}
                        >
                          {u.status === "blocked" ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                        </button>
                        <button onClick={() => removeUser(u)} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
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

      {/* Add / edit user modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={saveUser} className="my-8 w-full max-w-md animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editing ? "Edit User" : "Add User"}</h3>
              <button type="button" onClick={() => setModal(false)}><X className="h-5 w-5" /></button>
            </div>
            {error && <div className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Full Name</label>
                <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <input required type="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {editing ? "New Password (leave blank to keep current)" : "Password"}
                </label>
                <input required={!editing} minLength={6} className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? "Leave blank to keep unchanged" : "At least 6 characters"} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Role</label>
                  <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="student">Student</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Plan</label>
                  <select className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                    <option>Free</option><option>Premium</option><option>Pro</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModal(false)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : editing ? "Save Changes" : "Create User"}</button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}
