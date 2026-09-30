import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = { yt: [], ytComment: [], fbReel: [], igReel: [], fbComment: [], igComment: [] };
vi.mock("../src/config/youtube.js", async (orig) => ({
  ...(await orig()),
  isYoutubeConfigured: () => true,
  uploadVideoFileToYoutube: vi.fn(async (o) => { calls.yt.push(o); const id = `vid${calls.yt.length}`; return { ok: true, id, url: `https://youtu.be/${id}`, privacy: o.privacy }; }),
  setYtThumbnail: vi.fn(async () => ({ ok: true })),
  applyYtExtras: vi.fn(async () => []),
  commentOnYoutubeVideo: vi.fn(async (o) => { calls.ytComment.push(o); return { ok: true, id: "c1" }; }),
}));
vi.mock("../src/config/facebook.js", async (orig) => ({
  ...(await orig()),
  hashtagsForQuestion: async () => "#Economics",
  isFacebookConfigured: () => true,
  fbNotify: async () => {},
  postReelToFacebookPage: vi.fn(async (o) => { calls.fbReel.push(o); return { ok: true, id: "fbreel1" }; }),
  postReelToInstagram: vi.fn(async (o) => { calls.igReel.push(o); return { ok: true, id: "igreel1" }; }),
  commentOnFacebookPost: vi.fn(async (o) => { calls.fbComment.push(o); return { ok: true, id: "fc1" }; }),
  commentOnInstagramMedia: vi.fn(async (o) => { calls.igComment.push(o); return { ok: true, id: "ic1" }; }),
}));
vi.mock("../src/config/slideshow.js", () => ({ generateSlideshow: () => { throw new Error("must not render"); } }));

const { queuePublishPreview, getLongVideoJob, tenantKeyNow } = await import("../src/config/longVideo.js");
const preview = (id) => ({
  id, preview: true, status: "done", label: "Economics", title: "Economics | Topic | Quiz 1 (25 Questions)",
  questions: 25, range: "", duration: 900,
  videoUrl: "https://res.cloudinary.com/x/full.mp4", shortUrl: "https://res.cloudinary.com/x/short.mp4", shortQuestions: 3,
  publishData: { opts: { order: "sequential" }, breadcrumb: "", siteUrl: "https://s", firstQuestion: { _id: "q1" }, chapters: [], offset: 0, names: { subject: "Economics", topic: "Topic" } },
});
const waitDone = async (id) => { for (let i = 0; i < 300; i++) { const j = getLongVideoJob(id, tenantKeyNow()); if (j?.status === "done" || j?.status === "failed") return j; await new Promise((r) => setTimeout(r, 10)); } throw new Error("timeout"); };

beforeEach(() => { for (const k of Object.keys(calls)) calls[k].length = 0; globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]))); });

describe("the Short also as Facebook + Instagram Reels, with the full video's link commented", () => {
  it("posts both Reels from the Short and comments the full-video link on the Short and each Reel", async () => {
    const j = queuePublishPreview({ preview: preview("r1"), cfg: {}, site: {}, options: { toYoutube: true, asShort: true, shortToFacebook: true, shortToInstagram: true } });
    const done = await waitDone(j.id);
    expect(done.status).toBe("done");
    expect(calls.fbReel[0].videoUrl).toBe("https://res.cloudinary.com/x/short.mp4");
    expect(calls.igReel[0].videoUrl).toBe("https://res.cloudinary.com/x/short.mp4");
    expect(calls.fbReel[0].description).toContain("https://youtu.be/vid1");
    const link = "▶ Watch the full video (all questions with answers): https://youtu.be/vid1";
    const title = "Economics | Topic | Quiz 1 (25 Questions)";
    // Links aren't tappable in Shorts comments / on Instagram → a no-link pointer there.
    expect(calls.ytComment[0]).toEqual({ videoId: "vid2", text: `▶ Watch the full video (all questions with answers): tap our channel name → Videos\n🔎 Search: "${title}"` });
    expect(calls.fbComment[0]).toEqual({ postId: "fbreel1", message: link }); // Facebook links work
    expect(calls.igComment[0]).toEqual({ mediaId: "igreel1", message: `▶ Watch the full video (all questions with answers) on our YouTube channel\n🔎 Search: "${title}"\n🔗 Link in bio` });
    expect(calls.igReel[0].caption).not.toMatch(/https?:\/\//);
    expect(done.notes.join(" ")).toMatch(/Facebook Reel ✓.*Instagram Reel ✓/);
  });

  it("the link comment can be switched off", async () => {
    const j = queuePublishPreview({ preview: preview("r2"), cfg: {}, site: {}, options: { toYoutube: true, asShort: true, shortToInstagram: true, linkComment: false } });
    await waitDone(j.id);
    expect(calls.igReel).toHaveLength(1);
    expect(calls.ytComment).toHaveLength(0);
    expect(calls.igComment).toHaveLength(0);
  });

  it("a scheduled video posts no Reels / comments yet (it isn't public)", async () => {
    const j = queuePublishPreview({ preview: preview("r3"), cfg: {}, site: {}, publishAt: new Date(Date.now() + 3600e3).toISOString(), options: { toYoutube: true, asShort: true, shortToFacebook: true } });
    const done = await waitDone(j.id);
    expect(calls.fbReel).toHaveLength(0);
    expect(calls.ytComment).toHaveLength(0);
    expect(done.notes.join(" ")).toMatch(/Reels skipped/);
  });
});

describe("playlists", () => {
  it("adds only the long video to the playlist — never the Short", async () => {
    const yt = await import("../src/config/youtube.js");
    yt.applyYtExtras.mockClear();
    const p = preview("pl1");
    const j = queuePublishPreview({ preview: p, cfg: {}, site: {}, options: { toYoutube: true, asShort: true }, playlist: { id: "PLabcdefghij", title: "Env" } });
    await waitDone(j.id);
    const ids = yt.applyYtExtras.mock.calls.map((c) => c[0].videoId);
    expect(ids).toContain("vid1");     // the long video IS added
    expect(ids).not.toContain("vid2"); // vid2 = the Short
  });
});

describe("live progress for a schedule's video", () => {
  it("finds the video a schedule is making by schedule id (whatever tenant key it has)", async () => {
    const { queueFullQuizVideo, activeJobsForSchedules } = await import("../src/config/longVideo.js");
    const sid = "a".repeat(24);
    queueFullQuizVideo({ source: { quiz: "q1", label: "Env" }, cfg: {}, site: {}, options: { toYoutube: true }, scheduleId: sid, auto: true });
    const live = activeJobsForSchedules([sid, "b".repeat(24)]);
    expect(Object.keys(live)).toEqual([sid]);
    expect(live[sid].scheduleId).toBe(sid);
    expect(["queued", "running"]).toContain(live[sid].status);
    expect(activeJobsForSchedules(["c".repeat(24)])).toEqual({});
  });
});
