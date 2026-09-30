import { describe, it, expect } from "vitest";
import { rewriteChunkSize, rewriteMaxTokens, splitSharedRules, buildBatchRewritePrompt } from "../../src/utils/batchPrompt.js";
import { rotateEndpoints, quotaWaitMs } from "../../src/controllers/aiController.js";

const RULE = `Write a THOROUGH explanation ${"x".repeat(200)}`;
const prompt = (q) => [`Question type: mcq`, `Question: ${q.text}`, `Options:\nA) True\nB) False`, RULE].join("\n");

describe("bulk rewrite batching (like generation)", () => {
  it("spreads the questions over the keys, 2–6 per call", () => {
    expect(rewriteChunkSize(42, 29)).toBe(2);
    expect(rewriteChunkSize(300, 29)).toBe(6);
    expect(rewriteChunkSize(20, 5)).toBe(4);
    expect(rewriteChunkSize(50, 1)).toBe(6);
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
