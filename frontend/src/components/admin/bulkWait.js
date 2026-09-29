import { useEffect, useState } from "react";

// Live rate-limit status for the bulk AI jobs (Extend all / Regenerate all).
// The server reports the wait as `waitMs` (RELATIVE — immune to a phone clock
// that's a few seconds off) plus how many keys are working vs cooling down.
// We turn that into a local deadline and tick it every second, so the countdown
// runs smoothly between the 2-second status polls instead of jumping.

// status → { until (local epoch ms) | 0, waiting, working }
export function waitFromStatus(s) {
  const ms = Number(s?.waitMs);
  const rel = Number.isFinite(ms) && ms > 0 ? ms
    : s?.waitUntil ? Math.max(0, Number(s.waitUntil) - Date.now()) : 0; // older server
  return { until: rel > 0 ? Date.now() + rel : 0, waiting: Number(s?.waitingKeys) || 0, working: Number(s?.workingKeys) || 0 };
}

// Seconds left until `until` (local epoch ms), updated every second.
export function useSecondsLeft(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// The one-line status. verb: "Updating explanations" / "Regenerating".
export function bulkWaitText({ verb, done, total, wait, secondsLeft }) {
  const n = `${done} of ${total}`;
  if (!wait || !wait.waiting) return `${verb}… ${n}`;
  const cooling = `${plural(wait.waiting, "key")} cooling down from rate limits`;
  if (wait.working > 0) return `${verb}… ${n} · ${plural(wait.working, "key")} working, ${cooling}`;
  return secondsLeft > 0
    ? `⏳ Every key is rate limited at ${n} — continuing in ${secondsLeft}s…`
    : `⏳ Retrying now… ${n}`;
}
