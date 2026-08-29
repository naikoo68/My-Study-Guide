import { useState } from "react";
import { GraduationCap, Store, School, Users, ListChecks, Crown } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { featureEnabled } from "../../lib/instituteFeatures";
import AdminUsers from "./AdminUsers";
import AdminClients from "./AdminClients";
import AdminInstitutes from "./AdminInstitutes";
import StudentPlansManager from "../../components/admin/StudentPlansManager";
import AiPlansManager from "../../components/admin/AiPlansManager";
import TenantPlansManager from "../../components/admin/TenantPlansManager";
import PlanEnableToggle from "../../components/admin/PlanEnableToggle";

// One "Users" hub with a tab per account type. Each tab shows the ACCOUNTS list
// and (via a sub-toggle) the PLANS for that type:
//   • Students   → student accounts  + student plans
//   • Clients    → client accounts   + client plans
//   • Institutes → institutes        + institute plans   (super-admin only)
// The platform super-admin sees all three tabs; an institute admin sees only
// Students & Clients (and only the sections its access allows).
export default function AdminPeople() {
  const { user } = useAuth();
  const isSuper = user?.role === "admin";
  const features = user?.role === "institute_admin" ? (user?.tenant?.features || {}) : null;

  const canClients = isSuper || featureEnabled(features, "clients");
  const canPlans = isSuper || featureEnabled(features, "plans");

  const tabs = [
    { key: "students", label: "Students", Icon: GraduationCap },
    ...(canClients ? [{ key: "clients", label: "Creators", Icon: Store }] : []),
    ...(isSuper ? [{ key: "institutes", label: "Institutes", Icon: School }] : []),
  ];

  const [tab, setTab] = useState("students");
  const [view, setView] = useState("accounts"); // "accounts" | "plans"
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "students";

  const switchTab = (k) => { setTab(k); setView("accounts"); };

  // Plans are available for every tab (student/client/institute), gated by access.
  const plansView = view === "plans" && canPlans;

  const body = () => {
    if (activeTab === "institutes")
      return plansView ? <><PlanEnableToggle audience="institute" /><TenantPlansManager /></> : <AdminInstitutes />;
    if (activeTab === "clients")
      return plansView ? <><PlanEnableToggle audience="client" /><AiPlansManager /></> : <AdminClients />;
    return plansView ? <><PlanEnableToggle audience="student" /><StudentPlansManager /></> : <AdminUsers role="student" />;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Users className="h-6 w-6 text-brand-600" /> Users
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your students, creators{isSuper ? " and institutes" : ""} — their accounts and plans, all in one place.
        </p>
      </div>

      {/* Account-type tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === t.key
                ? "bg-brand-600 text-white shadow-soft"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            <t.Icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Accounts / Plans sub-toggle */}
      {canPlans && (
        <div className="flex w-full max-w-xs items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/60">
          <button
            onClick={() => setView("accounts")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              view === "accounts" ? "bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <ListChecks className="h-4 w-4" /> Accounts
          </button>
          <button
            onClick={() => setView("plans")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              view === "plans" ? "bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <Crown className="h-4 w-4" /> Plans
          </button>
        </div>
      )}

      <div>{body()}</div>
    </div>
  );
}
