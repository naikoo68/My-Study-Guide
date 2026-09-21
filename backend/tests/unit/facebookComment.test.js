import { describe, it, expect, afterEach, vi } from "vitest";
import { postCommentToFacebookPage, postCommentToInstagram } from "../../src/config/facebook.js";

// ─────────────────────────────────────────────────────────────────────────
// Auto-comment ("first comment") publishing paths.
//   Facebook: POST /{post_id}/comments { message } → { id }
//   Instagram: POST /{media_id}/comments { message } → { id }
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

describe("postCommentToFacebookPage", () => {
  it("posts the comment message on the given post id", async () => {
    const pageId = "page-comment-fb";
    const cfg = { pageId, token: "tok", version: VERSION };

    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/POST_1/comments")) {
        expect(field(opts, "message")).toBe("First! 👇");
        return reply({ id: "COMMENT_1" });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postCommentToFacebookPage({ postId: "POST_1", message: "First! 👇" }, cfg);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("COMMENT_1");
  });

  it("errors clearly with no post id or empty message", async () => {
    const cfg = { pageId: "p1", token: "t", version: VERSION };
    expect((await postCommentToFacebookPage({ postId: "", message: "hi" }, cfg)).ok).toBe(false);
    expect((await postCommentToFacebookPage({ postId: "X", message: "  " }, cfg)).ok).toBe(false);
  });
});

describe("postCommentToInstagram", () => {
  it("posts the comment on the given media id", async () => {
    const pageId = "page-comment-ig";
    const cfg = { pageId, token: "tok", version: VERSION };

    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/IG_MEDIA_1/comments")) {
        expect(field(opts, "message")).toBe("Follow for more");
        return reply({ id: "IG_COMMENT_1" });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const r = await postCommentToInstagram({ mediaId: "IG_MEDIA_1", message: "Follow for more" }, cfg);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("IG_COMMENT_1");
  });

  it("errors clearly with no media id", async () => {
    const r = await postCommentToInstagram({ mediaId: "", message: "hi" }, { pageId: "p2", token: "t", version: VERSION });
    expect(r.ok).toBe(false);
  });
});
