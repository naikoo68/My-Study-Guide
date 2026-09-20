import { describe, it, expect, afterEach, vi } from "vitest";
import { postReelToFacebookPage, postReelToInstagram } from "../../src/config/facebook.js";

// ─────────────────────────────────────────────────────────────────────────
// Reel publishing paths.
//
// Facebook Reels use the dedicated /video_reels resumable flow:
//   1) start  → { video_id, upload_url }
//   2) upload → POST the upload_url with a `file_url` header (hosted file)
//   3) finish → publish (video_state=PUBLISHED) with the description
// If that flow fails, a normal /videos post from the same URL is the fallback.
//
// Instagram Reels: create a media_type=REELS container from a video_url, wait
// for it to finish processing (status_code=FINISHED), then media_publish.
//
// global.fetch is mocked so no network call is made. resolvePageToken caches by
// pageId, so each test uses a UNIQUE pageId to stay isolated.
// ─────────────────────────────────────────────────────────────────────────

const VERSION = "v21.0";

const reply = (data, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => data });

const field = (opts, key) => {
  const b = opts?.body;
  if (b && typeof b.get === "function") return b.get(key);
  return new URLSearchParams(String(b || "")).get(key);
};

function installFetch(router) {
  const calls = [];
  const mock = vi.fn(async (url, opts = {}) => {
    calls.push({ url: String(url), opts, method: opts.method || "GET" });
    return router(String(url), opts);
  });
  global.fetch = mock;
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
});

describe("postReelToFacebookPage — /video_reels resumable flow", () => {
  it("runs start → upload (file_url header) → finish and returns the reel id", async () => {
    const pageId = "page-reel-happy";
    const cfg = { pageId, token: "tok-happy", version: VERSION };
    const UPLOAD_URL = "https://rupload.facebook.com/video-upload/v21.0/VID_1";

    const calls = installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) {
        return reply({ access_token: "PAGE_TOKEN" });
      }
      if (url.includes(`/${pageId}/video_reels`)) {
        if (field(opts, "upload_phase") === "start") {
          return reply({ video_id: "VID_1", upload_url: UPLOAD_URL });
        }
        // finish phase
        expect(field(opts, "upload_phase")).toBe("finish");
        expect(field(opts, "video_id")).toBe("VID_1");
        expect(field(opts, "video_state")).toBe("PUBLISHED");
        expect(field(opts, "description")).toBe("my reel");
        return reply({ success: true });
      }
      if (url === UPLOAD_URL) {
        // Upload phase: Page token as OAuth header + the hosted file URL.
        expect(opts.headers.Authorization).toBe("OAuth PAGE_TOKEN");
        expect(opts.headers.file_url).toBe("https://cdn/x.mp4");
        return reply({ success: true });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postReelToFacebookPage({ videoUrl: "https://cdn/x.mp4", description: "my reel" }, cfg);

    expect(r.ok).toBe(true);
    expect(r.id).toBe("VID_1");
    // Order: token, start, upload, finish.
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts[0].url).toContain("/video_reels"); // start
    expect(posts[1].url).toBe(UPLOAD_URL); // upload
    expect(posts[2].url).toContain("/video_reels"); // finish
  });

  it("falls back to a normal /videos post when the reel flow fails", async () => {
    const pageId = "page-reel-fallback";
    const cfg = { pageId, token: "tok-fb", version: VERSION };
    let sawVideosFallback = false;

    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) {
        return reply({ access_token: "PAGE_TOKEN" });
      }
      if (url.includes(`/${pageId}/video_reels`)) {
        // start fails → triggers the fallback.
        return reply({ error: { message: "reels unavailable" } }, { ok: false, status: 400 });
      }
      if (url.includes(`/${pageId}/videos`)) {
        sawVideosFallback = true;
        expect(field(opts, "file_url")).toBe("https://cdn/y.mp4");
        expect(field(opts, "description")).toBe("cap");
        return reply({ id: "VIDEO_9" });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postReelToFacebookPage({ videoUrl: "https://cdn/y.mp4", description: "cap" }, cfg);

    expect(sawVideosFallback).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("VIDEO_9");
  });

  it("errors clearly when there is no video URL", async () => {
    const r = await postReelToFacebookPage({ videoUrl: "" }, { pageId: "p", token: "t", version: VERSION });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/video/i);
  });
});

describe("postReelToInstagram — REELS container → publish", () => {
  it("creates a REELS container, waits for FINISHED, then publishes", async () => {
    const pageId = "page-ig-reel";
    const igId = "IG_1";
    const cfg = { pageId, token: "tok-ig", version: VERSION, igUserId: igId };

    let polls = 0;
    const calls = installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) {
        return reply({ access_token: "PAGE_TOKEN" });
      }
      // Create container.
      if (url.includes(`/${igId}/media`) && !url.includes("media_publish") && opts.method === "POST") {
        expect(field(opts, "media_type")).toBe("REELS");
        expect(field(opts, "video_url")).toBe("https://cdn/reel.mp4");
        expect(field(opts, "caption")).toBe("hi");
        return reply({ id: "CONTAINER_1" });
      }
      // Poll container status → FINISHED on the first poll (keeps the test fast:
      // the helper only sleeps BETWEEN polls, so an immediate FINISHED never waits).
      if (url.includes("CONTAINER_1") && url.includes("status_code")) {
        polls += 1;
        return reply({ status_code: "FINISHED" });
      }
      // Publish.
      if (url.includes(`/${igId}/media_publish`)) {
        expect(field(opts, "creation_id")).toBe("CONTAINER_1");
        return reply({ id: "IG_MEDIA_1" });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postReelToInstagram({ videoUrl: "https://cdn/reel.mp4", caption: "hi" }, cfg);

    expect(r.ok).toBe(true);
    expect(r.id).toBe("IG_MEDIA_1");
    expect(polls).toBeGreaterThanOrEqual(1);
    expect(calls.some((c) => c.url.includes("media_publish"))).toBe(true);
  });

  it("errors clearly when there is no video URL", async () => {
    const r = await postReelToInstagram({ videoUrl: "" }, { pageId: "p", token: "t", version: VERSION, igUserId: "IG" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/video/i);
  });
});
