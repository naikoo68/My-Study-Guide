import { describe, it, expect, vi, beforeEach } from "vitest";

// YouTube / Facebook / hashtags are faked — we check WHAT is posted and that
// nothing is re-rendered.
const uploads = [];
vi.mock("../src/config/youtube.js", async (orig) => {
  const real = await orig();
  return {
    ...real,
    isYoutubeConfigured: () => true,
    uploadVideoFileToYoutube: vi.fn(async (o) => {
      uploads.push(o);
      const id = `vid${uploads.length}`;
      return { ok: true, id, url: `https://youtu.be/${id}`, privacy: o.privacy };
    }),
    setYtThumbnail: vi.fn(async () => ({ ok: true })),
    applyYtExtras: vi.fn(async () => []),
  };
});
vi.mock("../src/config/facebook.js", async (orig) => ({
  ...(await orig()),
  hashtagsForQuestion: async () => "#Economics",
  isFacebookConfigured: () => false,
  fbNotify: async () => {},
}));
const renders = vi.fn();
vi.mock("../src/config/slideshow.js", () => ({ generateSlideshow: (...a) => { renders(...a); throw new Error("must not render"); } }));

const { queuePublishPreview, getLongVideoJob, tenantKeyNow } = await import("../src/config/longVideo.js");

const fakePreview = () => ({
  id: "p1", preview: true, status: "done", label: "Economics",
  title: "Economics | Economy and It's Types | Quiz 1 (25 Questions)",
  questions: 25, range: "", duration: 940,
  videoUrl: "https://res.cloudinary.com/x/full.mp4", shortUrl: "https://res.cloudinary.com/x/short.mp4", shortQuestions: 3,
  thumb: { image: Buffer.from("jpg"), mime: "image/jpeg" },
  publishData: {
    opts: { order: "sequential" }, breadcrumb: "JKSSB › Economics", siteUrl: "https://www.mystudyguide.in",
    firstQuestion: { _id: "q1" }, chapters: [{ question: 1, startSec: 0 }, { question: 2, startSec: 40 }, { question: 3, startSec: 80 }], offset: 0,
  },
});
const waitDone = async (id) => {
  for (let i = 0; i < 200; i++) {
    const j = getLongVideoJob(id, tenantKeyNow());
    if (j && (j.status === "done" || j.status === "failed")) return j;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timeout");
};

describe("publish a finished preview", () => {
  beforeEach(() => {
    uploads.length = 0;
    globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  });

  it("uploads the previewed full video, then the Short linking to it — no re-render", async () => {
    const preview = fakePreview();
    const j = queuePublishPreview({ preview, cfg: {}, site: {}, privacy: "unlisted", options: { toYoutube: true, asShort: true } });
    const done = await waitDone(j.id);
    expect(done.status).toBe("done");
    expect(renders).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(preview.videoUrl);
    expect(globalThis.fetch).toHaveBeenCalledWith(preview.shortUrl);
    expect(uploads).toHaveLength(2);
    expect(uploads[0].title).toBe(preview.title);
    expect(uploads[0].privacy).toBe("unlisted");
    expect(uploads[0].description).toContain("0:40 Question 2");
    expect(uploads[1].title).toMatch(/#Shorts$/);
    expect(uploads[1].description).toContain("https://youtu.be/vid1");
    expect(done.url).toBe("https://youtu.be/vid1");
    expect(done.shortUrl).toBe("https://youtu.be/vid2");
  });

  it("adds your 'text for every video' to the YouTube video and the Short", async () => {
    const preview = fakePreview();
    const site = { videoDescriptionText: "📲 Join our Telegram: t.me/msg", videoDescriptionYoutube: true };
    const j = queuePublishPreview({ preview, cfg: {}, site, options: { toYoutube: true, asShort: true } });
    await waitDone(j.id);
    for (const u of uploads) {
      expect(u.description).toContain("📲 Join our Telegram: t.me/msg");
      expect(u.description.trim().endsWith("#Economics")).toBe(true); // hashtags stay last
    }
    uploads.length = 0;
    const off = queuePublishPreview({ preview: fakePreview(), cfg: {}, site: { ...site, videoDescriptionYoutube: false }, options: { toYoutube: true } });
    await waitDone(off.id);
    expect(uploads[0].description).not.toContain("Join our Telegram");
  });

  it("publishes a preview only once", async () => {
    const preview = fakePreview();
    const j = queuePublishPreview({ preview, cfg: {}, site: {}, options: { toYoutube: true } });
    await waitDone(j.id);
    expect(() => queuePublishPreview({ preview, cfg: {}, site: {}, options: { toYoutube: true } })).toThrow(/already been published/);
  });

  it("refuses an unfinished preview or no destination", () => {
    expect(() => queuePublishPreview({ preview: { ...fakePreview(), status: "running" }, cfg: {}, site: {} })).toThrow(/can't be published/);
    expect(() => queuePublishPreview({ preview: fakePreview(), cfg: {}, site: {}, options: { toYoutube: false } })).toThrow(/Choose where/);
  });
});

describe("the published description starts with the title", () => {
  it("first line = title", async () => {
    const { queuePublishPreview: q2, getLongVideoJob: g2, tenantKeyNow: t2 } = await import("../src/config/longVideo.js");
    uploads.length = 0;
    globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1])));
    const j = q2({ preview: { ...fakePreview(), id: "p-desc" }, cfg: {}, site: {}, options: { toYoutube: true, asShort: true } });
    for (let i = 0; i < 200; i++) { const x = g2(j.id, t2()); if (x?.status === "done") break; await new Promise((r) => setTimeout(r, 10)); }
    expect(uploads[0].description.split("\n")[0]).toBe("Economics | Economy and It's Types | Quiz 1 (25 Questions)");
    expect(uploads[1].description.split("\n")[0]).toBe("Economics | Economy and It's Types | Quiz 1 (25 Questions)");
    expect(uploads[1].description).toContain("Watch the full video here");
  });
});
