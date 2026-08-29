import { useState } from "react";
import { GraduationCap, Store, School } from "lucide-react";
import StudentPlansManager from "../../components/admin/StudentPlansManager";
import AiPlansManager from "../../components/admin/AiPlansManager";
import TenantPlansManager from "../../components/admin/TenantPlansManager";
import { useAuth } from "../../context/AuthContext";
import PlanEnableToggle from "../../components/admin/PlanEnableToggle";

// One place to manage every subscription plan. Three tabs:
//   • Student Plans   — what students subscribe to (pricing only)
//   • Client Plans    — what self-service clients buy (pricing + AI limits)
//   • Institute Plans — what an institute pays to run its own space (pricing)
export default function AdminPlans() {
  const { user } = useAuth();
  // "Institute Plans" = what the PLATFORM charges institutes to run their space.
  // That's a super-admin-only concept; an institute admin only manages its OWN
  // student & client pricing.
  const isSuper = user?.role === "admin";
  const [tab, setTab] = useState("student"); // "student" | "client" | "institute"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Plans</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Manage the subscription plans &amp; pricing for students and creators in one place.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex max-w-md items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/60">
        <button
          onClick={() => setTab("student")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            tab === "student" ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-300"
          }`}
        >
          <GraduationCap className="h-4 w-4" /> Student Plans
        </button>
        <button
          onClick={() => setTab("client")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            tab === "client" ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-300"
          }`}
        >
          <Store className="h-4 w-4" /> Creator Plans
        </button>
        {isSuper && (
          <button
            onClick={() => setTab("institute")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "institute" ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            <School className="h-4 w-4" /> Institute Plans
          </button>
        )}
      </div>

      <PlanEnableToggle audience={tab === "institute" && !isSuper ? "student" : tab} />

      {tab === "student" ? <StudentPlansManager /> : tab === "client" ? <AiPlansManager /> : isSuper ? <TenantPlansManager /> : <StudentPlansManager />}
    </div>
  );
}
