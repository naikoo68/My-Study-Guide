import { describe, it, expect, vi, beforeEach } from "vitest";

// "Which video is being made, and stop it": the render queue order, stopping a
// waiting video, stopping one mid-render, and refusing to stop mid-upload.
// Rendering is faked as a slow loop that reports progress (like the real one).
const uploads = [];
vi.mock("../src/config/youtube.js", async (orig) => ({
  ...(await orig()),
  isYoutubeConfigured: () => true,
  uploadVideoFileToYoutube: vi.fn(async (o) => {
    uploads.push(o);
    await new Promise((r) => setTimeout(r, 60)); // an upload takes a moment
    return { ok: true, id: `v${uploads.length}`, url: `https://youtu.be/v${uploads.length}` };
  }),
  setYtThumbnail: vi.fn(async () => ({ ok: true })),
  applyYtExtras: vi.fn(async () => []),
}));
vi.mock("../src/config/facebook.js", async (orig) => ({
  ...(await orig()),
  completeQuestionsForSource: async () => [{ _id: "q1" }, { _id: "q2" }],
  pickAllQuestionsForSource: async () => [{ _id: "q1", text: "Q1" }, { _id: "q2", text: "Q2" }],
  hashtagsForQuestion: async () => "#Quiz",
  breadcrumbForQuestion: async () => "",
  titlePartsForQuestion: async () => ({}),
  isFacebookConfigured: () => false,
  fbNotify: async () => {},
}));
const SLIDES = 20;
vi.mock("../src/config/slideshow.js", () => ({
  generateSlideshow: async (_qs, opts) => {
    opts.onStatus?.("generating_slides");
    for (let i = 1; i <= SLIDES; i++) {
      await new Promise((r) => setTimeout(r, 15));
      opts.onProgress?.("generating_slides", i, SLIDES);
    }
    return { filePath: "", duration: 60, chapters: [] }; // no file → would fail, but stop comes first
  },
}));

const lv = await import("../src/config/longVideo.js");
const { queueFullQuizVideo, renderQueue, queueView, stopLongVideoJob, getLongVideoJob, tenantKeyNow } = lv;

const queue = (label) => queueFullQuizVideo({
  source: { label, quiz: "quiz1" }, cfg: { ytPrivacy: "public" }, site: {}, useThumbnail: false, options: { toYoutube: true },
});
const job = (id) => getLongVideoJob(id, tenantKeyNow());
const until = async (fn, ms = 3000) => {
  for (let t = 0; t < ms; t += 10) { if (fn()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error("timeout");
};
const settled = (id) => ["done", "failed", "cancelled"].includes(job(id)?.status);

describe("render queue + stop", () => {
  beforeEach(() => { uploads.length = 0; });

  it("lists the running video first, then the waiting ones in order", async () => {
    const a = queue("Topic A");
    const b = queue("Topic B");
    const c = queue("Topic C");
    await until(() => job(a.id).status === "running");
    const q = renderQueue().filter((j) => [a.id, b.id, c.id].includes(j.id)).map((j, i) => queueView(j, i));
    expect(q.map((x) => x.label)).toEqual(["Topic A", "Topic B", "Topic C"]);
    expect(q[0].status).toBe("running");
    expect(q[1].stageLabel).toBe("Waiting for another video to finish");
    expect(q.every((x) => x.canStop)).toBe(true);
    for (const j of [a, b, c]) stopLongVideoJob(j.id);
    await until(() => [a, b, c].every((j) => settled(j.id)));
  });

  it("drops a waiting video at once, and the queue carries on", async () => {
    const a = queue("Running");
    const b = queue("Waiting");
    await until(() => job(a.id).status === "running");
    stopLongVideoJob(b.id);
    expect(job(b.id).status).toBe("cancelled");
    expect(lv.publicJob(job(b.id)).stageLabel).toBe("Stopped by you");
    expect(renderQueue().some((j) => j.id === b.id)).toBe(false);
    stopLongVideoJob(a.id);
    await until(() => settled(a.id));
  });

  it("stops a video while it renders — within a progress tick, nothing uploaded", async () => {
    const a = queue("Mid-render");
    await until(() => (job(a.id).progress?.done || 0) >= 3);
    const at = job(a.id).progress.done;
    stopLongVideoJob(a.id);
    await until(() => settled(a.id));
    const j = job(a.id);
    expect(j.status).toBe("cancelled");
    expect(j.error).toMatch(/Stopped by you/);
    expect(j.progress.done).toBeLessThan(at + 2); // didn't render the remaining slides
    expect(uploads).toHaveLength(0);
    // The next video in line is not affected.
    const next = queue("Next");
    await until(() => job(next.id).status === "running");
    stopLongVideoJob(next.id);
    await until(() => settled(next.id));
  });

  it("refuses to stop a video that is already uploading, or finished", async () => {
    const a = queue("Uploading");
    await until(() => job(a.id).status === "running");
    job(a.id).uploadStarted = true; // as runJob sets right before uploading
    expect(() => stopLongVideoJob(a.id)).toThrow(/already uploading/);
    expect(queueView(job(a.id)).canStop).toBe(false);
    job(a.id).uploadStarted = false;
    stopLongVideoJob(a.id);
    await until(() => settled(a.id));
    expect(() => stopLongVideoJob(a.id)).toThrow(/already finished/);
    expect(() => stopLongVideoJob("nope")).toThrow(/no longer in the queue/);
  });
});
