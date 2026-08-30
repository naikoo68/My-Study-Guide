// A feature is ON unless the admin explicitly turned it OFF in Admin → Features
// (stored in settings.featureFlags as { key: false }). Items with no feature key
// are always shown. Used to hide a disabled feature everywhere it appears — the
// admin sidebar AND every public entry point (navbar, footer, the chooser page).
export function featureEnabled(settings, key) {
  if (!key) return true;
  return settings?.featureFlags?.[key] !== false;
}

// Same idea for the PUBLIC website. This is a SEPARATE flag set from the admin
// featureFlags, so a feature can be shown on the public site while hidden in the
// admin panel (or the reverse). Used by the navbar, home, footer and chooser.
// "My Quiz" and "My Test" have INDEPENDENT public switches (practiceQuiz /
// practiceTest). Older installs only had a single `practice` flag, so when a
// per-kind flag hasn't been set yet we fall back to that legacy value — which
// keeps a previously-disabled section disabled until the admin sets the new
// per-kind toggles.
function practiceKindOn(pf, kind) {
  const key = kind === "test" ? "practiceTest" : "practiceQuiz";
  if (pf && pf[key] !== undefined) return pf[key] !== false;
  return !pf || pf.practice !== false; // legacy fallback to the old single flag
}

export function publicFeatureEnabled(settings, key) {
  if (!key) return true;
  const pf = settings?.publicFeatureFlags || {};
  if (key === "practiceQuiz") return practiceKindOn(pf, "quiz");
  if (key === "practiceTest") return practiceKindOn(pf, "test");
  // The whole "My Practice" section is visible if EITHER kind is enabled.
  if (key === "practice") return practiceKindOn(pf, "quiz") || practiceKindOn(pf, "test");
  return pf[key] !== false;
}
