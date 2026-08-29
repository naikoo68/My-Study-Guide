// A feature is ON unless the admin explicitly turned it OFF in Admin → Features
// (stored in settings.featureFlags as { key: false }). Items with no feature key
// are always shown. Used to hide a disabled feature everywhere it appears — the
// admin sidebar AND every public entry point (navbar, footer, the chooser page).
export function featureEnabled(settings, key) {
  if (!key) return true;
  return settings?.featureFlags?.[key] !== false;
}
