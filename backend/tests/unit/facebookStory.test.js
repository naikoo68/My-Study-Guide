import { describe, it, expect, afterEach, vi } from "vitest";
import { postStoryToFacebookPage, postStoryToInstagram } from "../../src/config/facebook.js";

// ─────────────────────────────────────────────────────────────────────────
// Story publishing paths (24h Stories).
//
// Facebook Page Story:
//   1) upload the photo UNPUBLISHED → { id: photo_id }
//   2) POST /{page}/photo_stories { photo_id } → published
// Instagram Story:
//   create a media_type=STORIES container from image_url → wait FINISHED → publish
//
// global.fetch is mocked. resolvePageToken caches by pageId, so each test uses
// a UNIQUE pageId to stay isolated.
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
  global.fetch = vi.fn(async (url, opts = {}) => {
    calls.push({ url: String(url), opts, method: opts.method || "GET" });
    return router(String(url), opts);
  });
  return calls;
}
afterEach(() => { vi.restoreAllMocks(); delete global.fetch; });

describe("postStoryToFacebookPage — photo_stories", () => {
  it("uploads an unpublished photo, then publishes it as a Page Story", async () => {
    const pageId = "page-story-happy";
    const cfg = { pageId, token: "tok", version: VERSION };
    let sawUnpublished = false;

    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes(`/${pageId}/photos`)) {
        sawUnpublished = field(opts, "published") === "false";
        expect(field(opts, "url")).toBe("https://cdn/card.png");
        return reply({ id: "PHOTO_1" });
      }
      if (url.includes(`/${pageId}/photo_stories`)) {
        expect(field(opts, "photo_id")).toBe("PHOTO_1");
        return reply({ success: true, post_id: "STORY_9" });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postStoryToFacebookPage({ imageUrl: "https://cdn/card.png" }, cfg);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("STORY_9");
    expect(sawUnpublished).toBe(true);
  });

  it("errors clearly when there is no image", async () => {
    const r = await postStoryToFacebookPage({ imageUrl: "" }, { pageId: "p", token: "t", version: VERSION });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/image/i);
  });
});

describe("postStoryToInstagram — STORIES container → publish", () => {
  it("creates a STORIES container, waits for FINISHED, then publishes", async () => {
    const pageId = "page-ig-story";
    const igId = "IG_1";
    const cfg = { pageId, token: "tok", version: VERSION, igUserId: igId };

    const calls = installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes(`/${igId}/media`) && !url.includes("media_publish") && opts.method === "POST") {
        expect(field(opts, "media_type")).toBe("STORIES");
        expect(field(opts, "image_url")).toBe("https://cdn/card.png");
        return reply({ id: "CONTAINER_1" });
      }
      if (url.includes("CONTAINER_1") && url.includes("status_code")) {
        return reply({ status_code: "FINISHED" });
      }
      if (url.includes(`/${igId}/media_publish`)) {
        expect(field(opts, "creation_id")).toBe("CONTAINER_1");
        return reply({ id: "IG_STORY_1" });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postStoryToInstagram({ imageUrl: "https://cdn/card.png" }, cfg);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("IG_STORY_1");
    expect(calls.some((c) => c.url.includes("media_publish"))).toBe(true);
  });

  it("errors clearly when there is no image", async () => {
    const r = await postStoryToInstagram({ imageUrl: "" }, { pageId: "p", token: "t", version: VERSION, igUserId: "IG" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/image/i);
  });
});
