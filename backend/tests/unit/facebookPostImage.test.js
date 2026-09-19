import { describe, it, expect, afterEach, vi } from "vitest";
import { postToFacebookPage } from "../../src/config/facebook.js";

// ─────────────────────────────────────────────────────────────────────────
// postToFacebookPage image path — proves an image is published as a REAL Page
// FEED POST (two steps: upload unpublished → /feed with attached_media), so the
// returned id is a page-post id and Facebook counts it like a manual post.
// A single-step /photos publish (a photo-story object) is only a FALLBACK.
//
// global.fetch is mocked so no network call is made. resolvePageToken caches by
// pageId, so each test uses a UNIQUE pageId to stay isolated.
// ─────────────────────────────────────────────────────────────────────────

const VERSION = "v21.0";

// Build a fake Response the code understands: res.ok, res.status, res.json().
const reply = (data, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => data,
});

// Read a URLSearchParams body field regardless of how it was passed.
const field = (opts, key) => {
  const b = opts?.body;
  if (b && typeof b.get === "function") return b.get(key);
  return new URLSearchParams(String(b || "")).get(key);
};

// Install a fetch mock that routes on URL + body and records every call.
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

describe("postToFacebookPage — image publishes as a real feed post", () => {
  it("uploads the photo unpublished, then creates a /feed post attaching it", async () => {
    const pageId = "page-feed-happy";
    const cfg = { pageId, token: "tok-happy", version: VERSION };

    const calls = installFetch((url, opts) => {
      // resolvePageToken → GET the Page's own access token.
      if (opts.method !== "POST" && url.includes("fields=access_token")) {
        return reply({ access_token: "PAGE_TOKEN" });
      }
      // Step 1 — unpublished photo upload → returns a media_fbid.
      if (url.includes(`/${pageId}/photos`)) {
        expect(field(opts, "published")).toBe("false"); // must NOT create a story
        expect(field(opts, "url")).toBe("https://img/x.png");
        return reply({ id: "MEDIA_123" });
      }
      // Step 2 — feed post attaching the uploaded media → real page-post id.
      if (url.includes(`/${pageId}/feed`)) {
        const attached = JSON.parse(field(opts, "attached_media[0]"));
        expect(attached).toEqual({ media_fbid: "MEDIA_123" });
        expect(field(opts, "message")).toBe("hello");
        return reply({ id: `${pageId}_POST_1` });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postToFacebookPage({ message: "hello", imageUrl: "https://img/x.png" }, cfg);

    expect(r.ok).toBe(true);
    expect(r.id).toBe(`${pageId}_POST_1`); // the FEED POST id, not the bare photo id
    expect(r.id).not.toBe("MEDIA_123");

    // Order: token lookup, /photos (published=false), /feed (attached_media).
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts[0].url).toContain(`/${pageId}/photos`);
    expect(posts[1].url).toContain(`/${pageId}/feed`);
  });

  it("falls back to the legacy /photos publish when the feed-post flow fails", async () => {
    const pageId = "page-feed-fallback";
    const cfg = { pageId, token: "tok-fallback", version: VERSION };

    let sawUnpublishedUpload = false;
    let sawDirectPhoto = false;

    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) {
        return reply({ access_token: "PAGE_TOKEN" });
      }
      if (url.includes(`/${pageId}/photos`)) {
        if (field(opts, "published") === "false") {
          sawUnpublishedUpload = true;
          return reply({ id: "MEDIA_X" }); // step 1 succeeds
        }
        // Fallback: legacy direct photo publish (no published=false).
        sawDirectPhoto = true;
        expect(field(opts, "caption")).toBe("cap");
        return reply({ id: "PHOTO_Y", post_id: `${pageId}_STORY_9` });
      }
      if (url.includes(`/${pageId}/feed`)) {
        // Step 2 fails → triggers the fallback.
        return reply({ error: { message: "feed blew up" } }, { ok: false, status: 400 });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postToFacebookPage({ message: "cap", imageUrl: "https://img/y.png" }, cfg);

    expect(sawUnpublishedUpload).toBe(true);
    expect(sawDirectPhoto).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.id).toBe(`${pageId}_STORY_9`); // fallback still returns a usable id
  });

  it("returns a helpful token error when both the feed post and fallback fail", async () => {
    const pageId = "page-feed-tokenerr";
    const cfg = { pageId, token: "tok-err", version: VERSION };

    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) {
        return reply({ access_token: "PAGE_TOKEN" });
      }
      if (url.includes(`/${pageId}/photos`)) {
        if (field(opts, "published") === "false") return reply({ id: "MEDIA_Z" });
        return reply({ error: { message: "(#200) permissions error" } }, { ok: false, status: 403 });
      }
      if (url.includes(`/${pageId}/feed`)) {
        return reply({ error: { message: "(#200) permissions error" } }, { ok: false, status: 403 });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postToFacebookPage({ message: "x", imageUrl: "https://img/z.png" }, cfg);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/PAGE access token/i); // decorated (#200) message
  });
});

describe("postToFacebookPage — no-image path is unchanged", () => {
  it("publishes a plain /feed post with message + link and never calls /photos", async () => {
    const pageId = "page-textonly";
    const cfg = { pageId, token: "tok-text", version: VERSION };

    const calls = installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) {
        return reply({ access_token: "PAGE_TOKEN" });
      }
      if (url.includes(`/${pageId}/feed`)) {
        expect(field(opts, "message")).toBe("just text");
        expect(field(opts, "link")).toBe("https://site/a");
        return reply({ id: `${pageId}_TEXT_1` });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postToFacebookPage({ message: "just text", link: "https://site/a" }, cfg);

    expect(r.ok).toBe(true);
    expect(r.id).toBe(`${pageId}_TEXT_1`);
    expect(calls.some((c) => c.url.includes("/photos"))).toBe(false);
  });
});
