import { describe, it, expect } from "vitest";
import { rewriteChunkSize, rewriteMaxTokens, splitSharedRules, buildBatchRewritePrompt } from "../../src/utils/batchPrompt.js";
import { rotateEndpoints, quotaWaitMs } from "../../src/controllers/aiController.js";

const RULE = `Write a THOROUGH explanation ${"x".repeat(200)}`;
const prompt = (q) => [`Question type: mcq`, `Question: ${q.text}`, `Options:\nA) True\nB) False`, RULE].join("\n");

describe("bulk rewrite batching (like generation)", () => {
  it("'max' (default) fills requests up to 12; 'spread' shares 1–12 over all keys", () => {
    expect(rewriteChunkSize(26, 29)).toBe(12); // default: 26 → 12 + 12 + 2
    expect(rewriteChunkSize(26, 29, "spread")).toBe(1);
    expect(rewriteChunkSize(42, 29, "spread")).toBe(2);
    expect(rewriteChunkSize(300, 29, "spread")).toBe(11);
    expect(rewriteChunkSize(400, 29, "spread")).toBe(12);
    expect(rewriteMaxTokens(2)).toBe(6300);
    expect(rewriteMaxTokens(6)).toBe(15900);
  });

  it("sends the shared rule text once and keeps short repeated data in each block", () => {
    const { shared, blocks } = splitSharedRules([prompt({ text: "Q1" }), prompt({ text: "Q2" })]);
    expect(shared).toEqual([RULE]);
    expect(blocks[0]).toContain("A) True");
    expect(blocks[0]).not.toContain(RULE);
    const out = buildBatchRewritePrompt([{ text: "Q1" }, { text: "Q2" }], prompt);
    expect(out.split(RULE).length - 1).toBe(1);
    expect(out).toMatch(/### QUESTION 1\n[\s\S]*Question: Q1[\s\S]*### QUESTION 2\n[\s\S]*Question: Q2/);
  });

  it("keeps a rule that only some questions have inside those questions' blocks", () => {
    const extra = `ASSERTION FORMAT ${"y".repeat(200)}`;
    const { shared, blocks } = splitSharedRules([prompt({ text: "Q1" }), `${prompt({ text: "Q2" })}\n${extra}`]);
    expect(shared).toEqual([RULE]);
    expect(blocks[1]).toContain(extra);
  });
});

describe("single Extend / Regenerate key rotation", () => {
  const eps = [{ key: "k1", model: "m" }, { key: "k2", model: "m" }, { key: "k3", model: "m" }, { key: "k4", model: "other" }];
  it("rotates the start among keys on the chosen model and keeps fallback keys last", () => {
    expect(rotateEndpoints(eps, "m", 0).map((e) => e.key)).toEqual(["k1", "k2", "k3", "k4"]);
    expect(rotateEndpoints(eps, "m", 1).map((e) => e.key)).toEqual(["k2", "k3", "k1", "k4"]);
    expect(rotateEndpoints(eps, "m", 5).map((e) => e.key)).toEqual(["k3", "k1", "k2", "k4"]);
  });
});

describe("429 wait — same rule as question generation", () => {
  it("uses the provider's retryDelay capped at 20 s, else 30 s", () => {
    expect(quotaWaitMs('{"retryDelay":"7s"}')).toBe(7000);
    expect(quotaWaitMs('{"retryDelay":"45s"}')).toBe(20000);
    expect(quotaWaitMs("rate limited")).toBe(30000);
  });
});

describe("26 questions, up to 12 per request, 29 fresh keys", () => {
  it("sends 12 + 12 + 2 at once, and a rate-limited key's questions go to a fresh key", async () => {
    const { runKeyLanes } = await import("../../src/utils/keyLanes.js");
    const queue = Array.from({ length: 26 }, (_, i) => ({ id: i }));
    const lanes = Array.from({ length: 29 }, (_, i) => ({ key: `k${i + 1}` }));
    const calls = [];
    let inFlight = 0, peak = 0;
    await runKeyLanes({
      lanes, laneLabel: (ep) => ep.key, queue, chunkSize: 12, itemId: (q) => String(q.id), requeue: () => {},
      isStopped: () => false, timeLeftMs: () => 60000, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
      runChunk: async (chunk, ep) => {
        calls.push({ key: ep.key, n: chunk.length });
        inFlight += 1; peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        if (ep.key === "k1") return { outcome: "limited", filled: new Set(), retryMs: 60000 };
        return { outcome: "ok", filled: new Set(chunk.map((q) => String(q.id))) };
      },
      maxQuotaWaits: 0,
    });
    expect(calls.slice(0, 3).map((c) => c.n)).toEqual([12, 12, 2]);
    expect(peak).toBe(3); // the three requests run at the same time
    const retry = calls.find((c, i) => i >= 3);
    expect(retry.n).toBe(12);            // k1's 12 questions…
    expect(retry.key).not.toBe("k1");    // …went to a fresh key
    expect(calls.filter((c) => c.key !== "k1").reduce((a, c) => a + c.n, 0)).toBe(26);
  });
});

describe("a request too big for the key's limit shrinks instead of failing forever", () => {
  it("halves the batch after a 429 (12 → 6 → 3 → 2) until requests go through", async () => {
    const { runKeyLanes } = await import("../../src/utils/keyLanes.js");
    const queue = Array.from({ length: 22 }, (_, i) => ({ id: i }));
    const lanes = Array.from({ length: 29 }, (_, i) => ({ key: `k${i + 1}` }));
    let size = 12;
    const done = new Set();
    await runKeyLanes({
      lanes, laneLabel: (ep) => ep.key, queue, chunkSize: () => size, itemId: (q) => String(q.id), requeue: (q) => queue.push(q),
      isStopped: () => false, timeLeftMs: () => 60000, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
      runChunk: async (chunk) => {
        await new Promise((r) => setTimeout(r, 5));
        if (chunk.length > 2) { if (chunk.length <= size) size = Math.max(2, Math.ceil(chunk.length / 2)); return { outcome: "limited", filled: new Set(), retryMs: 60000 }; }
        chunk.forEach((q) => done.add(q.id));
        return { outcome: "ok", filled: new Set(chunk.map((q) => String(q.id))) };
      },
      maxQuotaWaits: 0,
    });
    expect(size).toBe(2);
    expect(done.size).toBe(22);
  });
});

describe("idle keys help a slow request (work stealing)", () => {
  it("finishes 25 questions while one 12-question request is still stuck", async () => {
    const { runKeyLanes } = await import("../../src/utils/keyLanes.js");
    const queue = Array.from({ length: 25 }, (_, i) => ({ id: i }));
    const lanes = Array.from({ length: 29 }, (_, i) => ({ key: `k${i + 1}` }));
    const done = new Set();
    const helped = [];
    let release;
    const stuck = new Promise((r) => { release = r; });
    const t0 = Date.now();
    await runKeyLanes({
      lanes, laneLabel: (ep) => ep.key, queue, chunkSize: 12, itemId: (q) => String(q.id), requeue: (q) => queue.push(q),
      isStopped: () => false, timeLeftMs: () => 60000,
      isDone: (q) => done.has(String(q.id)), isComplete: () => done.size >= 25, stealAfterMs: 30, stealSize: 2, idlePollMs: 5,
      runChunk: async (chunk, ep) => {
        if (ep.key === "k1") { await stuck; return { outcome: "ok", filled: new Set() }; } // the slow one
        if (chunk.length <= 2) helped.push(ep.key);
        await new Promise((r) => setTimeout(r, 5));
        const filled = new Set();
        chunk.forEach((q) => { if (!done.has(String(q.id))) { done.add(String(q.id)); filled.add(String(q.id)); } });
        return { outcome: "ok", filled };
      },
    });
    expect(done.size).toBe(25);
    expect(new Set(helped).size).toBeGreaterThanOrEqual(5); // several fresh keys shared the stuck 12
    expect(Date.now() - t0).toBeLessThan(2000);            // didn't wait for the stuck request
    release();
  });
});
