import { describe, it, expect, vi, afterEach } from "vitest";
import { publishToTelegram, telegramReady } from "../src/config/facebook.js";
import { longVideoTelegramText } from "../src/config/longVideo.js";

const cfg = { tgEnabled: true, tgBotToken: "123456789:AAEabcdefghijklmnopqrstuvwxyz012345", tgChatId: "@mystudyguide" };
const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });
const calls = [];
const tg = (fail = {}) => { calls.length = 0; globalThis.fetch = vi.fn(async (url, o) => { const m = url.split("/").pop(); const b = JSON.parse(o.body); calls.push({ m, b }); return { status: 200, json: async () => (fail[m] ? { ok: false, description: fail[m] } : { ok: true, result: { message_id: calls.length } }) }; }); };

describe("Post to Telegram", () => {
  it("is ready only when switched on and connected", () => {
    expect(telegramReady(cfg)).toBe(true);
    expect(telegramReady({ ...cfg, tgEnabled: false })).toBe(false);
    expect(telegramReady({ ...cfg, tgChatId: "" })).toBe(false);
  });
  it("Reel / Short / slideshow → the VIDEO with the caption", async () => {
    tg(); const notes = [];
    expect(await publishToTelegram({ cfg, videoUrl: "https://c/v.mp4", imageUrl: "https://c/i.jpg", caption: "Q1…", notes })).toBe(true);
    expect(calls).toEqual([{ m: "sendVideo", b: expect.objectContaining({ video: "https://c/v.mp4", caption: "Q1…" }) }]);
    expect(notes).toEqual(["Telegram ✓"]);
  });
  it("question / flashcard → the IMAGE", async () => {
    tg(); await publishToTelegram({ cfg, imageUrl: "https://c/i.jpg", caption: "Q1", notes: [] });
    expect(calls[0]).toMatchObject({ m: "sendPhoto", b: { photo: "https://c/i.jpg", caption: "Q1" } });
  });
  it("a video Telegram can't fetch falls back to the image", async () => {
    tg({ sendVideo: "Bad Request: failed to get HTTP URL content" }); const notes = [];
    expect(await publishToTelegram({ cfg, videoUrl: "https://c/v.mp4", imageUrl: "https://c/i.jpg", caption: "Q", notes })).toBe(true);
    expect(calls.map((c) => c.m)).toEqual(["sendVideo", "sendPhoto"]);
  });
  it("a caption over 1024 chars goes as a follow-up message", async () => {
    tg(); const long = "x".repeat(1500);
    await publishToTelegram({ cfg, imageUrl: "https://c/i.jpg", caption: long, notes: [] });
    expect(calls.map((c) => c.m)).toEqual(["sendPhoto", "sendMessage"]);
    expect(calls[1].b.text).toBe(long);
  });
  it("text only → a message", async () => {
    tg(); await publishToTelegram({ cfg, caption: "Hello", notes: [] });
    expect(calls[0]).toMatchObject({ m: "sendMessage", b: { text: "Hello" } });
  });
  it("long video → the LINK (not the file), with the Short's link", () => {
    const t = longVideoTelegramText({ title: "Economics | Topic | Quiz 1 (25 Questions)", url: "https://youtu.be/full", shortUrl: "https://youtu.be/short" }, "#Economics");
    expect(t).toBe("Economics | Topic | Quiz 1 (25 Questions)\n\n▶ Watch the full video: https://youtu.be/full\n⚡ Short: https://youtu.be/short\n\n#Economics");
  });
});
