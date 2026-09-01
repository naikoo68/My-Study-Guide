// A single, GLOBAL pointer to the most recent AI question-generation background
// job, stored in localStorage so it survives a full page reload.
//
// Why this exists: the "Generating…" progress pill used to live only in the
// React state of the open generator. On mobile, switching apps or minimizing
// the browser often makes the browser evict the tab, so returning RELOADS the
// page — wiping that state and the pill, even though the backend job is still
// running (it stays pollable by jobId for ~20 minutes). This pointer lets the
// app re-discover the running job after a reload and re-attach the pill.
//
// Shape:
//   {
//     jobId,       // id to poll via aiService.job(jobId)
//     ckKey,       // AiGenerate checkpoint key that holds this run's questions
//     targetName,  // the name used to build ckKey (so reopening rebuilds it)
//     label,       // topic / target name shown in the pill
//     requested,   // overall target count (the "of 1000")
//     count,       // questions produced so far (the "889")
//     status,      // "running" | "done"
//     dest,        // { subjectId, sessionId, quizId } snapshot for a recovery insert
//     source,      // client API source ("inbuilt"/"own") or null
//     updatedAt,   // last write (ms) — used for the staleness check
//   }
const KEY = "mstg.activeGenJob";

// The server keeps a finished/idle job for ~20 min (in-memory, then GC'd), so a
// pointer older than that can no longer be re-polled — treat it as stale.
const MAX_AGE_MS = 20 * 60 * 1000;

export function setActiveGenJob(rec) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...rec, updatedAt: Date.now() }));
  } catch {
    /* storage full / blocked (private mode) — the in-memory run still works */
  }
}

export function patchActiveGenJob(patch) {
  try {
    const cur = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!cur) return; // nothing to patch — a new run must setActiveGenJob() first
    localStorage.setItem(KEY, JSON.stringify({ ...cur, ...patch, updatedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function getActiveGenJob() {
  try {
    const rec = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!rec || !rec.jobId) return null;
    if (Date.now() - (rec.updatedAt || 0) > MAX_AGE_MS) {
      clearActiveGenJob();
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

export function clearActiveGenJob() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
