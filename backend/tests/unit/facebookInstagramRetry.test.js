import { describe, it, expect, afterEach, vi } from "vitest";
import { postToInstagram } from "../../src/config/facebook.js";

// A feed post that FIRST hits Meta's app rate limit ("Application request limit
// reached") should be RETRIED (the media container is already valid), so the
// post that is actually available on Instagram is no longer reported as failed.
// Fake timers make the back-off instant.

const VERSION = "v21.0";
const reply = (data, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => data });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete global.fetch; });

describe("postToInstagram — retries a transient rate limit", () => {
  it("re-publishes after 'Application request limit reached' and returns success", async () => {
    vi.useFakeTimers();
    const igId = "IG_1";
    const cfg = { pageId: "page-ig-retry", token: "tok", version: VERSION, igUserId: igId };
    let publishCalls = 0;

    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = String(url);
      const method = opts.method || "GET";
      if (method !== "POST" && u.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (u.includes(`/${igId}/media`) && !u.includes("media_publish") && method === "POST") return reply({ id: "C1" });
      if (u.includes("C1") && u.includes("status_code")) return reply({ status_code: "FINISHED" });
      if (u.includes(`/${igId}/media_publish`)) {
        publishCalls += 1;
        if (publishCalls === 1) {
          return reply({ error: { message: "Application request limit reached", code: 4 } }, { ok: false, status: 400 });
        }
        return reply({ id: "IG_MEDIA_OK" });
      }
      throw new Error(`unexpected call: ${u}`);
    });

    const p = postToInstagram({ imageUrl: "https://cdn/card.png", caption: "hi" }, cfg);
    await vi.runAllTimersAsync(); // flush the back-off sleeps + awaited microtasks
    const r = await p;

    expect(publishCalls).toBe(2);       // retried once after the rate limit
    expect(r.ok).toBe(true);
    expect(r.id).toBe("IG_MEDIA_OK");
  });

  it("rebuilds the container and succeeds after a transient 2207052 'could not be fetched'", async () => {
    // Instagram intermittently fails to fetch a perfectly valid public image
    // (subcode 2207052) — the same URL works seconds later. We must rebuild a
    // fresh container and retry, not give up after one attempt.
    vi.useFakeTimers();
    const igId = "IG_3";
    const cfg = { pageId: "page-ig-fetch", token: "tok", version: VERSION, igUserId: igId };
    let containerCalls = 0;

    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = String(url);
      const method = opts.method || "GET";
      if (method !== "POST" && u.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (u.includes(`/${igId}/media`) && !u.includes("media_publish") && method === "POST") {
        containerCalls += 1;
        if (containerCalls === 1) {
          // First attempt: Meta can't fetch the media.
          return reply({ error: { message: "Only photo or video can be accepted as media type.", code: 9004, error_subcode: 2207052 } }, { ok: false, status: 400 });
        }
        return reply({ id: "C3" }); // retry: container created
      }
      if (u.includes("C3") && u.includes("status_code")) return reply({ status_code: "FINISHED" });
      if (u.includes(`/${igId}/media_publish`)) return reply({ id: "IG_MEDIA_OK3" });
      throw new Error(`unexpected call: ${u}`);
    });

    const p = postToInstagram({ imageUrl: "https://cdn/card.jpg", caption: "hi" }, cfg);
    await vi.runAllTimersAsync();
    const r = await p;

    expect(containerCalls).toBe(2);   // rebuilt a fresh container once
    expect(r.ok).toBe(true);
    expect(r.id).toBe("IG_MEDIA_OK3");
  });

  it("gives up (no infinite loop) if the rate limit never clears", async () => {
    vi.useFakeTimers();
    const igId = "IG_2";
    const cfg = { pageId: "page-ig-retry-2", token: "tok", version: VERSION, igUserId: igId };
    let publishCalls = 0;

    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = String(url);
      const method = opts.method || "GET";
      if (method !== "POST" && u.includes("fields=access_token")) return reply({ access_token: "PAGE_TOKEN" });
      if (u.includes(`/${igId}/media`) && !u.includes("media_publish") && method === "POST") return reply({ id: "C2" });
      if (u.includes("C2") && u.includes("status_code")) return reply({ status_code: "FINISHED" });
      if (u.includes(`/${igId}/media_publish`)) {
        publishCalls += 1;
        return reply({ error: { message: "Application request limit reached", code: 4 } }, { ok: false, status: 400 });
      }
      throw new Error(`unexpected call: ${u}`);
    });

    const p = postToInstagram({ imageUrl: "https://cdn/card.png", caption: "hi" }, cfg);
    await vi.runAllTimersAsync();
    const r = await p;

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/request limit/i);
    expect(publishCalls).toBe(5); // capped attempts, then reports the failure
  });
});
