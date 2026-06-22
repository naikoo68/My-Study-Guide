import { useState } from "react";
import { Search, Ban, CheckCircle2, KeyRound, Crown } from "lucide-react";
import { adminUsers } from "../../data/admin";
import Badge from "../../components/ui/Badge";

export default function AdminUsers() {
  const [users, setUsers] = useState(adminUsers);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const toggleBlock = (id) =>
    setUsers((us) =>
      us.map((u) =>
        u.id === id
          ? { ...u, status: u.status === "blocked" ? "active" : "blocked" }
          : u
      )
    );

  const resetPassword = (name) => {
    setToast(`Password reset link sent to ${name}.`);
    setTimeout(() => setToast(""), 2500);
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const planVariant = (p) =>
    p === "Premium" ? "brand" : p === "Pro" ? "accent" : "neutral";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">User Management</h1>
        <p className="text-slate-500 dark:text-slate-400">
          View users, manage subscriptions, block/unblock and reset passwords.
        </p>
      </div>

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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="input pl-9"
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
            <tr>
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Plan</th>
              <th className="px-5 py-3 font-semibold">Tests</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      {u.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={planVariant(u.plan)}>
                    {u.plan !== "Free" && <Crown className="h-3 w-3" />} {u.plan}
                  </Badge>
                </td>
                <td className="px-5 py-3">{u.tests}</td>
                <td className="px-5 py-3">{u.joined}</td>
                <td className="px-5 py-3">
                  <Badge variant={u.status === "active" ? "Easy" : "Hard"}>{u.status}</Badge>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => resetPassword(u.name)}
                      title="Reset password"
                      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleBlock(u.id)}
                      title={u.status === "blocked" ? "Unblock" : "Block"}
                      className={`rounded-lg p-2 ${
                        u.status === "blocked"
                          ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          : "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                      }`}
                    >
                      {u.status === "blocked" ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}
