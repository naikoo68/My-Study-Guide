// Telegram (Bot API) — post to a channel / group through the site's own bot.
// Setup: create a bot with @BotFather (→ bot token), add the bot to your
// channel as an ADMIN with "Post messages", and use the channel's @username
// (public) or its numeric id (-100…, private) as the chat.
// All calls return { ok, error?, … } and never throw.
const API = "https://api.telegram.org";

export const cleanTgToken = (t) => String(t || "").trim();
// "@name", "https://t.me/name", "-100123…" → the chat id Telegram accepts.
export function cleanTgChat(c) {
  const s = String(c || "").trim();
  const m = /^(?:https?:\/\/)?t(?:elegram)?\.me\/([A-Za-z0-9_]{4,})\/?$/i.exec(s);
  if (m) return `@${m[1]}`;
  if (/^-?\d{5,}$/.test(s)) return s;
  if (/^@?[A-Za-z][A-Za-z0-9_]{3,}$/.test(s)) return s.startsWith("@") ? s : `@${s}`;
  return "";
}
export const telegramConfigured = (cfg) => !!(cfg?.tgBotToken && cfg?.tgChatId);

async function call(token, method, body, timeoutMs = 60000) {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: false, error: "The bot token doesn't look right (it's like 123456789:AAE…, from @BotFather)." };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: ac.signal });
    const data = await res.json().catch(() => ({}));
    if (data?.ok) return { ok: true, result: data.result };
    return { ok: false, error: friendly(data?.description || `Telegram error (${res.status})`) };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "Telegram didn't answer in time." : e?.message || "Could not reach Telegram." };
  } finally { clearTimeout(t); }
}
function friendly(d) {
  const s = String(d);
  if (/unauthorized/i.test(s)) return "The bot token is wrong or was revoked — copy it again from @BotFather.";
  if (/chat not found/i.test(s)) return "Channel not found — check the @username / id, and add the bot to the channel.";
  if (/not enough rights|have no rights|need administrator|not a member/i.test(s)) return "The bot isn't an admin of the channel — add it as an administrator with “Post messages”.";
  return s;
}

// Check the bot + that it can post in the chat → { ok, bot, chat, error? }
export async function verifyTelegram({ tgBotToken, tgChatId }) {
  const token = cleanTgToken(tgBotToken);
  const me = await call(token, "getMe", {}, 20000);
  if (!me.ok) return me;
  const chatId = cleanTgChat(tgChatId);
  if (!chatId) return { ok: false, error: "Enter the channel @username (or the -100… id)." };
  const chat = await call(token, "getChat", { chat_id: chatId }, 20000);
  if (!chat.ok) return chat;
  return { ok: true, bot: `@${me.result.username}`, chat: chat.result.title || chat.result.username || chatId };
}

export async function sendTelegramMessage({ text, disablePreview = false } = {}, cfg) {
  if (!telegramConfigured(cfg)) return { ok: false, error: "Telegram isn't connected." };
  const r = await call(cleanTgToken(cfg.tgBotToken), "sendMessage", { chat_id: cleanTgChat(cfg.tgChatId), text: String(text || "").slice(0, 4096), link_preview_options: { is_disabled: !!disablePreview } });
  return r.ok ? { ok: true, id: r.result.message_id, url: tgLink(cfg, r.result) } : r;
}
// A photo / video from a PUBLIC url (Telegram fetches it). Caption ≤ 1024.
export async function sendTelegramMedia({ url, caption = "", kind = "photo" } = {}, cfg) {
  if (!telegramConfigured(cfg)) return { ok: false, error: "Telegram isn't connected." };
  const method = kind === "video" ? "sendVideo" : "sendPhoto";
  const r = await call(cleanTgToken(cfg.tgBotToken), method, { chat_id: cleanTgChat(cfg.tgChatId), [kind === "video" ? "video" : "photo"]: url, caption: String(caption || "").slice(0, 1024), ...(kind === "video" ? { supports_streaming: true } : {}) }, 180000);
  return r.ok ? { ok: true, id: r.result.message_id, url: tgLink(cfg, r.result) } : r;
}
const tgLink = (cfg, m) => {
  const c = cleanTgChat(cfg.tgChatId);
  return c.startsWith("@") ? `https://t.me/${c.slice(1)}/${m.message_id}` : "";
};
