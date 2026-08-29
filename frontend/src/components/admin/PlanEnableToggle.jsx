import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useSettings } from "../../context/SettingsContext";

// Which site-settings flag controls each audience's plans, plus the copy shown
// when the plans are turned off (that audience then gets everything free).
const PLAN_TOGGLE = {
  student: {
    flag: "studentPlansEnabled",
    noun: "Student",
    off: "Students use everything free — no subscription needed and the student plans are hidden from the pricing page.",
  },
  client: {
    flag: "creatorPlansEnabled",
    noun: "Creator",
    off: "Creator accounts never expire and use everything free — the creator plans are hidden from the pricing page.",
  },
  institute: {
    flag: "institutePlansEnabled",
    noun: "Institute",
    off: "Institute plans are hidden from the public pricing page.",
  },
};

// Enable/disable switch for one audience's subscription plans. Turning it OFF
// hides those plans from the public pricing page AND makes that audience free
// (the paywall is bypassed on the server). Accepts audience: student|client|
// institute. Renders nothing for an unknown audience.
export default function PlanEnableToggle({ audience }) {
  const { settings, save } = useSettings();
  const [saving, setSaving] = useState(false);
  const cfg = PLAN_TOGGLE[audience];
  if (!cfg) return null;
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
    <div className={`mb-4 flex items-center gap-3 rounded-xl border p-4 ${on ? "border-slate-200 dark:border-slate-700" : "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800 dark:text-slate-100">
          {cfg.noun} plans are {on ? "ON" : "OFF"}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {on ? "Plans are shown on the pricing page and a subscription is required." : cfg.off}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${on ? "Disable" : "Enable"} ${cfg.noun.toLowerCase()} plans`}
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
