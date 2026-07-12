import { useEffect, useState } from "react";
import { Search, Ban, CheckCircle2, KeyRound, UserPlus, Trash2, X, ListChecks, FileStack, HelpCircle, Store } from "lucide-react";
import { userService } from "../../services";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

const blank = { name: "", email: "", password: "" };

const fmtDate = (d) =>
  new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

// Self-service "client" accounts — people who register at /client/register and
// build/practice their own private My Practice content. This screen lets the
// admin see them, create them, block/unblock, reset passwords and delete.
export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    userService
      .clients()
      .then((res) => setClients(res.clients || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  };

  const toggleBlock = async (c) => {
    try {
      const res = await userService.toggleStatus(c._id);
      setClients((list) => list.map((x) => (x._id === c._id ? { ...x, status: res.status } : x)));
    } catch (e) {
      flash(e.message);
    }
  };

  const resetPassword = async (c) => {
    try {
      await userService.resetPassword(c._id);
      flash(`Password reset link issued for ${c.name}.`);
    } catch (e) {
      flash(e.message);
    }
  };

  const removeClient = async (c) => {
    if (!window.confirm(`Delete client "${c.name}"? This also permanently deletes ALL their My Practice content. This cannot be undone.`)) return;
    try {
      await userService.remove(c._id);
      setClients((list) => list.filter((x) => x._id !== c._id));
      flash("Client deleted.");
    } catch (e) {
      flash(e.message);
    }
  };

  const saveClient = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await userService.create({ ...form, role: "client" });
      setClients((list) => [{ ...created, quizzes: 0, tests: 0, questions: 0 }, ...list]);
      flash("Client created.");
      setModal(false);
      setForm(blank);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = clients.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Store className="h-6 w-6 text-accent-500" /> Clients</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Self-service accounts that build & practice their own private My Practice content. Create, block, reset passwords or delete them here.
          </p>
        </div>
        <button onClick={() => { setForm(blank); setError(""); setModal(true); }} className="btn-primary">
          <UserPlus className="h-4 w-4" /> Add Client
        </button>
      </div>

      {loading ? (
        <Loading label="Loading clients..." />
      ) : error && !modal ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { l: "Total Clients", v: clients.length, c: "text-brand-600" },
              { l: "Active", v: clients.filter((c) => c.status === "active").length, c: "text-emerald-600" },
              { l: "Blocked", v: clients.filter((c) => c.status === "blocked").length, c: "text-rose-600" },
              { l: "Questions Created", v: clients.reduce((s, c) => s + (c.questions || 0), 0), c: "text-accent-600" },
            ].map((s) => (
              <div key={s.l} className="card p-5 text-center">
                <p className={`text-3xl font-extrabold ${s.c}`}>{s.v}</p>
                <p className="mt-1 text-sm text-slate-500">{s.l}</p>
              </div>
            ))}
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients..." className="input pl-9" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState message={search ? "No clients match your search." : "No client accounts yet. They appear here when people register at /client/register (or add one above)."} />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Client</th>
                    <th className="px-5 py-3 font-semibold">Content</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Joined</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((c) => (
                    <tr key={c._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
                            {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </span>
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-xs text-slate-400">{c.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="brand"><ListChecks className="h-3 w-3" /> {c.quizzes} quizzes</Badge>
                          <Badge variant="accent"><FileStack className="h-3 w-3" /> {c.tests} tests</Badge>
                          <Badge variant="neutral"><HelpCircle className="h-3 w-3" /> {c.questions} Qs</Badge>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={c.status === "active" ? "Easy" : "Hard"}>{c.status}</Badge>
                        {c.isEmailVerified === false && <span className="ml-2 text-xs text-amber-500">unverified</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400">{fmtDate(c.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => resetPassword(c)} title="Reset password" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleBlock(c)}
                            title={c.status === "blocked" ? "Unblock" : "Block"}
                            className={`rounded-lg p-2 ${c.status === "blocked" ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30" : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30"}`}
                          >
                            {c.status === "blocked" ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                          </button>
                          <button onClick={() => removeClient(c)} title="Delete client & their content" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
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
        </>
      )}

      {/* Add client modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={saveClient} className="my-8 w-full max-w-md animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add Client</h3>
              <button type="button" onClick={() => setModal(false)}><X className="h-5 w-5" /></button>
            </div>
            {error && <div className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Full Name</label>
                <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Client name" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <input required type="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="client@example.com" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Password</label>
                <input required minLength={6} className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" />
              </div>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                The client can log in immediately at the normal login page and will land in their own private My Practice workspace.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModal(false)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Create Client"}</button>
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
