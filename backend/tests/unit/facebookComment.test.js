import { describe, it, expect, afterEach, vi } from "vitest";
import { commentOnFacebookPost, commentOnInstagramMedia, postAutoFirstComment } from "../../src/config/facebook.js";

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
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete global.fetch; });

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



describe("comment propagation retries", () => {
  it("retries a newly-published Facebook object until its comments edge is available", async () => {
    vi.useFakeTimers();
    const cfg = { pageId: "page-cmt-fb-retry", token: "tok", version: VERSION };
    let attempts = 0;
    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/NEW_POST/comments")) {
        attempts += 1;
        if (attempts === 1) {
          return reply({ error: { message: "Unsupported get request. Object does not exist", code: 100 } }, { ok: false, status: 400 });
        }
        return reply({ id: "COMMENT_AFTER_RETRY" });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const pending = commentOnFacebookPost({ postId: "NEW_POST", message: "hello" }, cfg);
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(attempts).toBe(2);
    expect(result).toEqual({ ok: true, id: "COMMENT_AFTER_RETRY" });
  });

  it("retries a newly-published Instagram media object until comments are available", async () => {
    vi.useFakeTimers();
    const cfg = { pageId: "page-cmt-ig-retry", token: "tok", version: VERSION };
    let attempts = 0;
    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/NEW_IG/comments")) {
        attempts += 1;
        if (attempts === 1) {
          return reply({ error: { message: "Media ID is not available", code: 2 } }, { ok: false, status: 400 });
        }
        return reply({ id: "IG_COMMENT_AFTER_RETRY" });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const pending = commentOnInstagramMedia({ mediaId: "NEW_IG", message: "hello" }, cfg);
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(attempts).toBe(2);
    expect(result).toEqual({ ok: true, id: "IG_COMMENT_AFTER_RETRY" });
  });

  it("does not retry a permanent permission error and explains the needed scopes", async () => {
    const cfg = { pageId: "page-cmt-permission", token: "tok", version: VERSION };
    let attempts = 0;
    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/P/comments")) {
        attempts += 1;
        return reply({ error: { message: "Permissions error", code: 200 } }, { ok: false, status: 403 });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const result = await commentOnFacebookPost({ postId: "P", message: "hello" }, cfg);
    expect(attempts).toBe(1);
    expect(result.error).toMatch(/pages_manage_engagement/i);
  });
});

describe("postAutoFirstComment — scheduled publish integration", () => {
  it("uses captured FB + IG publication ids and creates every configured comment on both", async () => {
    const cfg = { pageId: "page-auto-both", token: "tok", version: VERSION };
    const posted = [];
    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/FB_POST/comments") || url.includes("/IG_MEDIA/comments")) {
        posted.push({ url, message: field(opts, "message") });
        return reply({ id: `COMMENT_${posted.length}` });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const notes = [];
    await postAutoFirstComment({
      site: {
        fbAutoCommentEnabled: true,
        fbAutoComments: ["@everyone", "Follow My Study Guide"],
        fbAutoCommentMode: "all",
        fbAutoCommentToFacebook: true,
        fbAutoCommentToInstagram: true,
      },
      cfg,
      fbAttempts: [{ ok: true, id: "FB_POST" }],
      igMediaId: "IG_MEDIA",
      notes,
    });

    expect(posted).toHaveLength(4);
    expect(posted.filter((p) => p.url.includes("/FB_POST/comments")).map((p) => p.message))
      .toEqual(["@everyone", "Follow My Study Guide"]);
    expect(posted.filter((p) => p.url.includes("/IG_MEDIA/comments")).map((p) => p.message))
      .toEqual(["@everyone", "Follow My Study Guide"]);
    expect(notes).toEqual([]);
  });

  it("appends fbAutoCommentMentions to every comment (IG @handle, FB @[page-id])", async () => {
    const cfg = { pageId: "page-auto-mentions", token: "tok", version: VERSION };
    const posted = [];
    installFetch((url, opts) => {
      if (opts.method !== "POST" && url.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (url.includes("/FB_POST/comments") || url.includes("/IG_MEDIA/comments")) {
        posted.push({ url, message: field(opts, "message") });
        return reply({ id: `COMMENT_${posted.length}` });
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const notes = [];
    await postAutoFirstComment({
      site: {
        fbAutoCommentEnabled: true,
        fbAutoComments: ["Follow My Study Guide"],
        fbAutoCommentMode: "rotate",
        fbAutoCommentToFacebook: true,
        fbAutoCommentToInstagram: true,
        fbAutoCommentMentions: ["@mystudyguide_", "@[123456789]"],
      },
      cfg,
      fbAttempts: [{ ok: true, id: "FB_POST" }],
      igMediaId: "IG_MEDIA",
      notes,
    });

    expect(posted).toHaveLength(2);
    const fbMsg = posted.find((p) => p.url.includes("/FB_POST/comments"))?.message;
    const igMsg = posted.find((p) => p.url.includes("/IG_MEDIA/comments"))?.message;
    // Facebook: plain handles lose their "@" (Facebook wouldn't render them as
    // mentions anyway) and Page tags stay in the bracketed form so Facebook
    // renders them as a clickable Page mention.
    expect(fbMsg).toBe("Follow My Study Guide\n\nmystudyguide_ @[123456789]");
    // Instagram: bare `@handle` is a real clickable mention; the FB bracket
    // form is unwrapped so it doesn't render as literal text.
    expect(igMsg).toBe("Follow My Study Guide\n\n@mystudyguide_ @123456789");
    expect(notes).toEqual([]);
  });
});