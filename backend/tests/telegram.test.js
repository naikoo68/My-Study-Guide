import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanTgChat, verifyTelegram, sendTelegramMessage } from "../src/config/telegram.js";

const TOKEN = "123456789:AAEabcdefghijklmnopqrstuvwxyz012345";
const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });
const tg = (answers) => { globalThis.fetch = vi.fn(async (url, o) => { const m = url.split("/").pop(); const a = answers[m]; return { status: 200, json: async () => (typeof a === "function" ? a(JSON.parse(o.body)) : a) }; }); };

describe("Telegram connection", () => {
  it("normalises the channel", () => {
    expect(cleanTgChat("mystudyguide")).toBe("@mystudyguide");
    expect(cleanTgChat("https://t.me/mystudyguide")).toBe("@mystudyguide");
    expect(cleanTgChat("-1001234567890")).toBe("-1001234567890");
    expect(cleanTgChat("a b")).toBe("");
  });
  it("checks the bot and the channel", async () => {
    tg({ getMe: { ok: true, result: { username: "MsgBot" } }, getChat: { ok: true, result: { title: "My Study Guide" } } });
    expect(await verifyTelegram({ tgBotToken: TOKEN, tgChatId: "@mystudyguide" })).toEqual({ ok: true, bot: "@MsgBot", chat: "My Study Guide" });
  });
  it("explains the common mistakes", async () => {
    tg({ getMe: { ok: false, description: "Unauthorized" } });
    expect((await verifyTelegram({ tgBotToken: TOKEN, tgChatId: "@x1234" })).error).toMatch(/bot token is wrong/);
    tg({ getMe: { ok: true, result: { username: "b" } }, getChat: { ok: false, description: "Bad Request: chat not found" } });
    expect((await verifyTelegram({ tgBotToken: TOKEN, tgChatId: "@x1234" })).error).toMatch(/add the bot to the channel/);
    expect((await verifyTelegram({ tgBotToken: "nope", tgChatId: "@x1234" })).error).toMatch(/doesn't look right/);
  });
  it("sends a message and returns its public link", async () => {
    tg({ sendMessage: (b) => ({ ok: true, result: { message_id: 42, text: b.text } }) });
    const r = await sendTelegramMessage({ text: "hi" }, { tgBotToken: TOKEN, tgChatId: "@mystudyguide" });
    expect(r).toEqual({ ok: true, id: 42, url: "https://t.me/mystudyguide/42" });
  });
});
