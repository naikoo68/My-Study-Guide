// Global upload-progress store. Any upload routed through the shared upload
// helpers reports here, so a single site-wide progress bar can show the
// percentage of whatever is uploading — anywhere in the app, with no per-screen
// wiring. Subscribers get { count, pct }: how many uploads are in flight and the
// average percent complete.
let seq = 0;
const active = new Map(); // id -> pct (0..100)
const listeners = new Set();

function snapshot() {
  const vals = [...active.values()];
  const count = vals.length;
  const pct = count ? Math.round(vals.reduce((s, p) => s + (p || 0), 0) / count) : 0;
  return { count, pct };
}
function emit() {
  const s = snapshot();
  for (const cb of listeners) { try { cb(s); } catch { /* ignore listener errors */ } }
}

// Start tracking an upload; returns an id to update/finish it.
export function beginUpload() { const id = ++seq; active.set(id, 0); emit(); return id; }
// Update an upload's percent (0..100).
export function updateUpload(id, pct) {
  if (!active.has(id)) return;
  active.set(id, Math.max(0, Math.min(100, Math.round(pct || 0))));
  emit();
}
// Finish/remove an upload (on success OR failure).
export function endUpload(id) { if (active.delete(id)) emit(); }

// Subscribe to progress changes; immediately called with the current state.
// Returns an unsubscribe function.
export function subscribeUploads(cb) {
  listeners.add(cb);
  cb(snapshot());
  return () => listeners.delete(cb);
}
