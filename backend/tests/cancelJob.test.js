import { describe, it, expect, vi, afterEach } from "vitest";
import { callProvider, startJob, jobSleep, cancelJob, _genJobs as genJobs } from "../src/controllers/aiController.js";

// A provider that never answers until the request is aborted (a slow model).
const hangingFetch = () => vi.fn((url, { signal }) => new Promise((_, reject) => {
  signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
}));
const res = () => { const r = { code: 200, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("Stop / Cancel is instant", () => {
  it("aborts an AI request that is still waiting for the model", async () => {
    globalThis.fetch = hangingFetch();
    genJobs.set("j1", { status: "pending", questions: [], requested: 5, updatedAt: Date.now() });
    let result;
    startJob("j1", async () => {
      result = await callProvider({ key: "k", baseUrl: "https://api.example.com/v1", model: "gemini-x", userPrompt: "hi", maxTokens: 10 });
    });
    await new Promise((r) => setTimeout(r, 30));
    const t = Date.now();
    cancelJob({ params: { id: "j1" } }, res());
    for (let i = 0; i < 50 && !result; i++) await new Promise((r) => setTimeout(r, 10));
    expect(result).toMatchObject({ ok: false, status: 499, cancelled: true });
    expect(Date.now() - t).toBeLessThan(200); // not the 60 s request timeout
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // and it is NOT retried
  });

  it("wakes a rate-limit wait immediately", async () => {
    genJobs.set("j2", { status: "pending", questions: [], requested: 5, updatedAt: Date.now() });
    let woke = 0;
    const t = Date.now();
    startJob("j2", async () => { await jobSleep(60000); woke = Date.now(); });
    await new Promise((r) => setTimeout(r, 20));
    cancelJob({ params: { id: "j2" } }, res());
    for (let i = 0; i < 50 && !woke; i++) await new Promise((r) => setTimeout(r, 10));
    expect(woke - t).toBeLessThan(300);
  });

  it("an Extend / Regenerate job is finished at once, keeping what was saved", () => {
    genJobs.set("j3", { status: "pending", rewrite: true, questions: [1, 1, 1], requested: 10, updatedAt: Date.now() });
    const r = res();
    cancelJob({ params: { id: "j3" } }, r);
    expect(r.body).toMatchObject({ ok: true, status: "done", cancelled: true, count: 3 });
    expect(genJobs.get("j3")).toMatchObject({ status: "done", cancelled: true, updatedCount: 3, remaining: 7 });
  });

  it("a generate job keeps running until its workers wind down (they keep the partial batch)", () => {
    genJobs.set("j4", { status: "pending", questions: [], requested: 10, updatedAt: Date.now() });
    const r = res();
    cancelJob({ params: { id: "j4" } }, r);
    expect(genJobs.get("j4").cancelled).toBe(true);
    expect(genJobs.get("j4").status).toBe("pending");
  });
});
