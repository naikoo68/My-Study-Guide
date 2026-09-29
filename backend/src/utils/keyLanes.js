// Shared work scheduler for the bulk AI jobs (Extend all, Regenerate all,
// Flashcard details): several "lanes" (one or more per API key) pull chunks of
// questions from ONE queue.
//
// Fixes vs. the old per-job loops:
//  • A lane no longer RETIRES the moment the queue looks empty. Chunks come BACK
//    to the queue when another key hits a rate limit (429) — the old loop had
//    already let every healthy key quit by then, so only the rate-limited keys
//    were left and the job crawled / stalled at e.g. "34 of 50". Idle lanes now
//    stay until nothing is in flight or waiting.
//  • The wait after a 429 honours the provider's retryDelay (+1 s), instead of
//    capping it at 20 s (Gemini often says ~27 s → the early retry was
//    guaranteed to be limited again, wasting requests).
//  • The wait state is per KEY (not per lane) and reports how many keys are
//    working vs waiting, so the UI can say what is really happening.
// Pure scheduling — the caller supplies runChunk; `now`/`sleep` are injectable
// for tests.

// Retry wait from a provider 429 body: Gemini's "retryDelay":"27s" (or "27.5s")
// → 28 s; a Retry-After style number; else `fallbackMs`. Clamped to 5–60 s.
export function bulkRetryMs(detail, fallbackMs = 30000) {
  const s = String(detail || "");
  const m = /"retryDelay"\s*:\s*"?(\d+(?:\.\d+)?)\s*s/i.exec(s) || /retry(?:[\s_-]*after|[\s_-]*in)\D{0,5}(\d+(?:\.\d+)?)\s*s/i.exec(s);
  const ms = m ? Math.ceil(parseFloat(m[1]) * 1000) + 1000 : fallbackMs;
  return Math.max(5000, Math.min(60000, ms));
}

// lanes      — array of endpoints (the same endpoint may appear more than once)
// laneLabel  — (ep) => a stable key label (lanes sharing a key share its wait)
// queue      — the shared array of items (mutated)
// chunkSize  — items per call
// runChunk   — async (chunk, ep) => { outcome: "ok"|"soft"|"limited"|"exhausted"|"dead", filled:Set<id>, retryMs? }
// itemId     — (item) => string id
// requeue    — (item) => void — bounded re-queue for "soft" misses (caller counts tries)
// isStopped  — () => boolean (deadline passed / cancelled)
// timeLeftMs — () => ms until the job deadline (a wait past it ends the lane)
// onState    — ({ waitUntil, waitingKeys, workingKeys }) => void
export async function runKeyLanes({
  lanes, laneLabel, queue, chunkSize, runChunk, itemId, requeue, isStopped, timeLeftMs,
  onState = () => {}, maxQuotaWaits = 6, idlePollMs = 400,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(),
}) {
  const inFlight = new Map(); // key label → requests in flight
  const waitingUntil = new Map(); // key label → wait deadline (epoch ms)
  const waitsByKey = new Map(); // key label → 429 waits used (shared by that key's lanes)
  let requests = 0; // requests in flight right now (all keys)
  // Work is finished when nothing is queued and nothing is in flight: a key
  // cooling down from a 429 holds no items (it handed its chunk back).
  const finished = () => queue.length === 0 && requests === 0;
  // Sleep up to `ms`, waking early when the job ends or is finished.
  const nap = async (ms) => {
    const end = now() + ms;
    while (now() < end) {
      if (isStopped() || finished()) return;
      await sleep(Math.min(idlePollMs * 5, end - now()));
    }
  };
  const emit = () => {
    const t = now();
    const waits = [...waitingUntil.values()].filter((u) => u > t);
    onState({
      waitUntil: waits.length ? Math.min(...waits) : null,
      waitingKeys: waits.length,
      workingKeys: [...inFlight.values()].filter((n) => n > 0).length,
    });
  };
  const bump = (m, k, d) => m.set(k, (m.get(k) || 0) + d);

  const lane = async (ep) => {
    const key = laneLabel(ep);
    for (;;) {
      if (isStopped()) return;
      // This key is cooling down (another of its lanes got a 429): wait with it.
      const until = waitingUntil.get(key) || 0;
      if (until > now()) { if (finished()) return; await nap(Math.min(until - now(), 60000)); continue; }
      const chunk = queue.length ? queue.splice(0, chunkSize) : null; // atomic: no await in between
      if (!chunk) {
        // Nothing to take right now — but a request in flight may hand work back
        // (429 / skipped items). Retire only when nothing is in flight.
        if (requests === 0) return;
        await sleep(idlePollMs);
        continue;
      }
      requests += 1;
      bump(inFlight, key, 1); emit();
      let res;
      try { res = await runChunk(chunk, ep); } catch { res = { outcome: "soft", filled: new Set() }; }
      bump(inFlight, key, -1);
      requests -= 1;
      const outcome = res?.outcome || "soft";
      const filled = res?.filled instanceof Set ? res.filled : new Set();
      if (outcome === "dead" || outcome === "exhausted") {
        queue.push(...chunk); emit(); return; // hand the work back, retire this key's lane
      }
      if (outcome === "limited") {
        queue.push(...chunk); // a free key can take these right away
        const used = waitsByKey.get(key) || 0;
        const waitMs = Math.max(1000, Number(res.retryMs) || 30000);
        if (used >= maxQuotaWaits || waitMs >= timeLeftMs()) { emit(); return; }
        waitsByKey.set(key, used + 1);
        const next = now() + waitMs;
        if (next > (waitingUntil.get(key) || 0)) waitingUntil.set(key, next);
        emit();
        await nap(waitMs);
        if ((waitingUntil.get(key) || 0) <= now()) waitingUntil.delete(key);
        emit();
        continue;
      }
      for (const it of chunk) if (!filled.has(itemId(it))) requeue(it); // ok / soft
      emit();
    }
  };
  await Promise.all(lanes.map((ep) => lane(ep)));
  waitingUntil.clear(); inFlight.clear(); emit();
}
