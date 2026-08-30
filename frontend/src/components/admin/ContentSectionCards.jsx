import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { publicFeatureEnabled } from "../../lib/features";

// Reusable card grid for the "Manage Content" section pages (Manage Content,
// Public Practice, My Practice). Each card links to a section (or a sub-folder)
// and — when it maps to public feature(s) — carries an Enable/Disable switch
// that toggles whether STUDENTS see that section on the public site
// (settings.publicFeatureFlags). Admin access is unaffected, so the card stays
// here even when disabled.
//
// Each card in `cards` = { to, label, desc, icon, tint, feature | features }.
export default function ContentSectionCards({ cards }) {
  const { user } = useAuth();
  const { settings, save } = useSettings();
  const [saving, setSaving] = useState("");

  const instituteFeatures = user?.role === "institute_admin" ? (user?.tenant?.features || {}) : null;
  const adminFlags = settings?.featureFlags || {};
  const publicFlags = settings?.publicFeatureFlags || {};
  // Public feature flags are a GLOBAL platform setting managed only by the
  // super-admin (the Admin → Features page is super-admin only). So only show
  // the Enable/Disable switch to them; institute admins just see the cards.
  const canToggle = user?.role === "admin";

  // Admin-side visibility — hide the card entirely if its feature is off for
  // this admin (global Admin → Features toggle, or a per-institute toggle).
  const adminOn = (f) => {
    if (adminFlags[f] === false) return false;
    if (instituteFeatures && instituteFeatures[f] === false) return false;
    return true;
  };
  const featsOf = (c) => (c.features ? c.features : c.feature ? [c.feature] : []);
  const visible = (c) => {
    const feats = featsOf(c);
    return feats.length ? feats.some(adminOn) : true;
  };
  // The public switch is ON only when ALL of a card's features are public-on.
  // Uses publicFeatureEnabled so per-kind practice flags (and their legacy
  // fallback) resolve the same way they do on the public site.
  const publicOn = (c) => featsOf(c).every((f) => publicFeatureEnabled(settings, f));

  const toggle = async (c) => {
    const feats = featsOf(c);
    if (!feats.length || saving) return;
    const turnOn = !publicOn(c); // any feature off → turn them all on
    setSaving(c.to);
    try {
      const next = { ...publicFlags };
      for (const f of feats) next[f] = turnOn;
      await save({ publicFeatureFlags: next });
    } catch {
      /* SettingsContext surfaces errors globally; keep the UI responsive */
    } finally {
      setSaving("");
    }
  };

  const shown = cards.filter(visible);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((c) => {
        const hasToggle = canToggle && featsOf(c).length > 0;
        const on = publicOn(c);
        return (
          <div key={c.to} className="card flex items-start gap-3 p-5">
            <Link to={c.to} className="group flex min-w-0 flex-1 items-start gap-4">
              <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${c.tint}`}>
                <c.icon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-bold">
                  {c.label}
                  <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.desc}</p>
              </div>
            </Link>

            {hasToggle && (
              <div className="flex flex-shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? "Disable" : "Enable"} ${c.label} for students`}
                  title={on ? "Enabled for students — tap to hide from the public site" : "Disabled — tap to show on the public site"}
                  disabled={saving === c.to}
                  onClick={() => toggle(c)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"}`}
                >
                  {saving === c.to ? (
                    <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                  ) : (
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                  )}
                </button>
                <span className={`text-[10px] font-semibold ${on ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                  {on ? "Enabled" : "Disabled"}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
