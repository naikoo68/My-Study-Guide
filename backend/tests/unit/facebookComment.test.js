import { describe, it, expect, afterEach, vi } from "vitest";
import { commentOnFacebookPost, commentOnInstagramMedia } from "../../src/config/facebook.js";

// Auto first-comment helpers: post a comment on a published FB post / IG media.
// global.fetch is mocked; unique pageIds keep resolvePageToken's cache isolated.

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

describe("commentOnFacebookPost", () => {
  it("posts the comment on /{post-id}/comments and returns the comment id", async () => {
    const pageId = "page-cmt-fb";
    const cfg = { pageId, token: "tok", version: VERSION };
    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/POST_1/comments")) {
        expect(field(opts, "message")).toBe("Follow us! @everyone");
        return reply({ id: "COMMENT_1" });
      }
      throw new Error(`unexpected call: ${url}`);
    });
    const r = await commentOnFacebookPost({ postId: "POST_1", message: "Follow us! @everyone" }, cfg);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("COMMENT_1");
  });

  it("errors when the post id or text is missing", async () => {
    const cfg = { pageId: "p", token: "t", version: VERSION };
    expect((await commentOnFacebookPost({ postId: "", message: "hi" }, cfg)).ok).toBe(false);
    expect((await commentOnFacebookPost({ postId: "X", message: "" }, cfg)).ok).toBe(false);
  });
});

describe("commentOnInstagramMedia", () => {
  it("posts the comment on /{ig-media-id}/comments and returns the comment id", async () => {
    const pageId = "page-cmt-ig";
    const cfg = { pageId, token: "tok", version: VERSION };
    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/IGMEDIA_1/comments")) {
        expect(field(opts, "message")).toBe("Link in bio 🔗");
        return reply({ id: "IGCOMMENT_1" });
      }
      throw new Error(`unexpected call: ${url}`);
    });
    const r = await commentOnInstagramMedia({ mediaId: "IGMEDIA_1", message: "Link in bio 🔗" }, cfg);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("IGCOMMENT_1");
  });

  it("surfaces a Graph API error", async () => {
    const pageId = "page-cmt-ig-err";
    const cfg = { pageId, token: "tok", version: VERSION };
    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/M/comments")) return reply({ error: { message: "Permission missing" } }, { ok: false, status: 403 });
      throw new Error(`unexpected call: ${url}`);
    });
    const r = await commentOnInstagramMedia({ mediaId: "M", message: "hi" }, cfg);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission/i);
  });
});
