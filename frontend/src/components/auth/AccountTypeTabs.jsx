import { GraduationCap, Store, School } from "lucide-react";
import { useSettings } from "../../context/SettingsContext";

// Segmented account-type selector shown on the auth pages.
// `active` is "student" | "client" | "institute"; onSelect(key) fires on click.
// Pass `withInstitute` to show the third "Institute" tab (used on the register
// pages so a coaching institute can sign up for its own branded space — it's
// left off the Login page, which has no separate institute login).
// The Client and Institute tabs are ALSO hidden platform-wide when the
// super-admin turns off publicClientEnabled / publicInstituteEnabled.
const GRID_COLS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

export default function AccountTypeTabs({ active, onSelect, withInstitute = false }) {
  const { settings } = useSettings();
  const showClient = settings?.publicClientEnabled !== false;
  // The "Institute" option is ONLY for the platform (default) site — registering
  // a NEW institute doesn't belong on an existing institute's own site. Student
  // and Creator still show there.
  const isInstituteSite = settings?.isDefaultTenant === false;
  const showInstitute = withInstitute && !isInstituteSite && settings?.publicInstituteEnabled !== false;
  const tabs = [
    { key: "student", label: "Student", Icon: GraduationCap },
    ...(showClient ? [{ key: "client", label: "Creator", Icon: Store }] : []),
    ...(showInstitute ? [{ key: "institute", label: "Institute", Icon: School }] : []),
  ];
  return (
    <div className={`mb-5 grid gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 ${GRID_COLS[tabs.length] || "grid-cols-3"}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          aria-pressed={active === t.key}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            active === t.key
              ? "bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <t.Icon className="h-4 w-4" /> {t.label}
        </button>
      ))}
    </div>
  );
}
