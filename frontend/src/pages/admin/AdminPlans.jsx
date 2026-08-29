import { useState } from "react";
import { GraduationCap, Store, School, Loader2 } from "lucide-react";
import StudentPlansManager from "../../components/admin/StudentPlansManager";
import AiPlansManager from "../../components/admin/AiPlansManager";
import TenantPlansManager from "../../components/admin/TenantPlansManager";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";

// Which settings flag controls each audience's plans, plus the copy shown when
// the plans are turned off (that audience then gets everything free).
const PLAN_TOGGLE = {
  student: { flag: "studentPlansEnabled", noun: "student", off: "Students use everything free — no subscription needed and the student plans are hidden from the pricing page." },
  client: { flag: "creatorPlansEnabled", noun: "creator", off: "Creator accounts never expire and use everything free — the creator plans are hidden from the pricing page." },
  institute: { flag: "institutePlansEnabled", noun: "institute", off: "Institute plans are hidden from the pricing page." },
};

// Enable/disable switch for the current audience's plans. Turning it OFF hides
// the plans from the public pricing page AND makes that audience free (the
// paywall is bypassed on the server).
function PlanEnableToggle({ audience }) {
  const { settings, save } = useSettings();
  const [saving, setSaving] = useState(false);
  const cfg = PLAN_TOGGLE[audience];
  const on = settings?.[cfg.flag] !== false;

  const toggle = async () => {
    setSaving(true);
    try {
      await save({ [cfg.flag]: !on });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${on ? "border-slate-200 dark:border-slate-700" : "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800 dark:text-slate-100">
          {on ? `${cfg.noun[0].toUpperCase()}${cfg.noun.slice(1)} plans are ON` : `${cfg.noun[0].toUpperCase()}${cfg.noun.slice(1)} plans are OFF`}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {on ? "Plans are shown on the pricing page and a subscription is required." : cfg.off}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${on ? "Disable" : "Enable"} ${cfg.noun} plans`}
        disabled={saving}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"}`}
      >
        {saving ? (
          <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
        ) : (
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
        )}
      </button>
    </div>
  );
}

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
