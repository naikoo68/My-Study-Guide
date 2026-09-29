import { describe, it, expect } from "vitest";
import { runKeyLanes, bulkRetryMs } from "../src/utils/keyLanes.js";

const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` }));
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

function harness({ keys, limitedFor = {}, retryMs = 300, work = 5 }) {
  const done = new Set();
  const calls = [];
  const states = [];
  const hits = {}; // key → 429s already returned
  const runChunk = async (chunk, ep) => {
    calls.push(ep.label);
    await tick(work);
    if ((hits[ep.label] || 0) < (limitedFor[ep.label] || 0)) {
      hits[ep.label] = (hits[ep.label] || 0) + 1;
      return { outcome: "limited", filled: new Set(), retryMs };
    }
    const filled = new Set(chunk.map((q) => q.id));
    for (const id of filled) done.add(id);
    return { outcome: "ok", filled };
  };
  const lanes = keys.map((label) => ({ label, key: label }));
  return { done, calls, states, hits, runChunk, lanes };
}
const run = (h, queue, extra = {}) => runKeyLanes({
  lanes: h.lanes, laneLabel: (ep) => ep.label, queue, chunkSize: 2, itemId: (q) => q.id,
  requeue: (q) => queue.push(q), runChunk: h.runChunk,
  isStopped: () => false, timeLeftMs: () => 60000, idlePollMs: 5, onState: (s) => h.states.push(s), ...extra,
});

describe("runKeyLanes — bulk Extend / Regenerate scheduler", () => {
  it("a rate-limited key's chunk is finished by a FREE key — no waiting (the '34 of 50' stall)", async () => {
    // 5 keys, 10 questions: k1 & k2 are rate limited on their first call.
    const h = harness({ keys: ["k1", "k2", "k3", "k4", "k5"], limitedFor: { k1: 1, k2: 1 }, retryMs: 2000 });
    const t = Date.now();
    await run(h, items(10));
    expect(h.done.size).toBe(10);
    // Old loop: k3–k5 had already retired, so the job waited out k1/k2's 2 s.
    expect(Date.now() - t).toBeLessThan(1500);
  });

  it("waits the provider's retryDelay when EVERY key is limited, then finishes", async () => {
    const h = harness({ keys: ["k1", "k2"], limitedFor: { k1: 1, k2: 1 }, retryMs: 250 });
    const t = Date.now();
    await run(h, items(4));
    expect(h.done.size).toBe(4);
    expect(Date.now() - t).toBeGreaterThanOrEqual(240);
    // While both waited, the state said so: 2 keys cooling, none working.
    expect(h.states.some((s) => s.waitingKeys === 2 && s.workingKeys === 0 && s.waitUntil > 0)).toBe(true);
    expect(h.states.at(-1)).toEqual({ waitUntil: null, waitingKeys: 0, workingKeys: 0 });
  });

  it("reports keys working and keys waiting at the same time", async () => {
    const h = harness({ keys: ["k1", "k2", "k3"], limitedFor: { k1: 1 }, retryMs: 400, work: 30 });
    await run(h, items(12));
    expect(h.done.size).toBe(12);
    expect(h.states.some((s) => s.waitingKeys === 1 && s.workingKeys >= 1)).toBe(true);
  });

  it("lanes sharing one key wait together (no extra requests while it cools down)", async () => {
    const h = harness({ keys: ["k1", "k1", "k1"], limitedFor: { k1: 1 }, retryMs: 200, work: 20 });
    await run(h, items(6));
    expect(h.done.size).toBe(6);
    expect(h.hits.k1).toBe(1);
    // only ONE 429 counted, and the key shows as ONE waiting key, never three
    expect(Math.max(...h.states.map((s) => s.waitingKeys))).toBe(1);
  });

  it("gives up on a key after maxQuotaWaits (the rest is reported as not done)", async () => {
    const h = harness({ keys: ["bad"], limitedFor: { bad: 99 }, retryMs: 5 });
    const queue = items(4);
    await run(h, queue, { maxQuotaWaits: 2 });
    expect(h.done.size).toBe(0);
    expect(h.hits.bad).toBe(3); // 2 waits, then retired on the 3rd 429
    expect(queue).toHaveLength(4); // handed back → the job reports 4 remaining
  });

  it("a cooling key doesn't keep the job open once the others finished the work", async () => {
    const h = harness({ keys: ["bad", "good"], limitedFor: { bad: 99 }, retryMs: 3000 });
    const t = Date.now();
    await run(h, items(6));
    expect(h.done.size).toBe(6);
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it("stops when cancelled", async () => {
    let stop = false;
    const h = harness({ keys: ["k1"], work: 20 });
    const queue = items(20);
    setTimeout(() => { stop = true; }, 30);
    await run(h, queue, { isStopped: () => stop });
    expect(h.done.size).toBeLessThan(20);
  });
});

describe("bulkRetryMs — honour the provider's retryDelay", () => {
  it("uses Gemini's retryDelay + 1 s (the old 20 s cap retried too early)", () => {
    expect(bulkRetryMs('{"error":{"details":[{"retryDelay":"27s"}]}}')).toBe(28000);
    expect(bulkRetryMs('"retryDelay": "12.4s"')).toBe(13400);
  });
  it("clamps to 5–60 s and falls back to 30 s", () => {
    expect(bulkRetryMs('"retryDelay":"1s"')).toBe(5000);
    expect(bulkRetryMs('"retryDelay":"300s"')).toBe(60000);
    expect(bulkRetryMs("rate limited")).toBe(30000);
  });
});
