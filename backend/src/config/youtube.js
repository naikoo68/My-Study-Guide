// YouTube auto-posting (Shorts) via the YouTube Data API v3.
//
// Connection: the admin clicks "Connect YouTube" (Admin → Facebook). Google's
// OAuth consent screen returns a one-time `code` to our callback, which we
// exchange for a long-lived REFRESH token (scope youtube.upload +
// youtube.readonly for the channel name). The refresh token is stored
// ENCRYPTED on that tenant's Settings doc and never sent to the browser.
//
// Publishing: YouTube cannot pull a video from a URL (unlike Meta), so we
// download the already-hosted MP4 (Cloudinary) and push it through the
// resumable upload endpoint. A vertical video ≤ 3 min is shown as a Short.
//
// Everything uses plain fetch() — no googleapis dependency.

import crypto from "crypto";
import { encryptSecret, decryptSecret } from "../utils/keyCrypto.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];
export const YT_PRIVACY = ["public", "unlisted", "private"];
const MAX_VIDEO_BYTES = 256 * 1024 * 1024; // Reels/Shorts are small; guard memory
const EDUCATION_CATEGORY = "27";

// fetch() with a hard timeout so a stalled Google call can't hang the scheduler.
async function ytFetch(url, opts = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- OAuth app credentials (per settings doc, falling back to env) ----
export function ytClientCreds(site) {
  const clientId = String(site?.ytClientId || process.env.YOUTUBE_CLIENT_ID || "").trim();
  const storedSecret = site?.ytClientSecret ? decryptSecret(site.ytClientSecret) : "";
  const clientSecret = String(storedSecret || process.env.YOUTUBE_CLIENT_SECRET || "").trim();
  return { clientId, clientSecret };
}

// The exact redirect URI registered in Google Cloud. Env override wins;
// otherwise derived from the API host the admin is talking to.
export function ytRedirectUri(req) {
  const env = String(process.env.YOUTUBE_REDIRECT_URI || "").trim();
  if (env) return env;
  const host = req?.get ? req.get("host") : "";
  const proto = req?.protocol === "http" && !/^localhost|^127\./.test(host || "") ? "https" : (req?.protocol || "https");
  return `${proto}://${host}/api/youtube/oauth/callback`;
}

// Is a settings doc / cfg ready to upload? (enabled + a refresh token + app creds)
export function isYoutubeConfigured(cfg) {
  return !!(cfg?.ytEnabled && cfg?.ytRefreshToken && cfg?.ytClientId && cfg?.ytClientSecret);
}

// Pull the YouTube part of a Settings doc into a plain config (decrypted).
export function youtubeConfigFromSite(site) {
  const { clientId, clientSecret } = ytClientCreds(site);
  return {
    ytEnabled: !!site?.ytEnabled,
    ytRefreshToken: site?.ytRefreshToken ? decryptSecret(site.ytRefreshToken) : "",
    ytClientId: clientId,
    ytClientSecret: clientSecret,
    ytChannelTitle: String(site?.ytChannelTitle || ""),
    ytPrivacy: YT_PRIVACY.includes(site?.ytPrivacy) ? site.ytPrivacy : "public",
    ytSettingsId: site?._id ? String(site._id) : "",
  };
}

// ---- Signed OAuth `state` (stateless, so it works across server instances) ----
function stateKey() {
  const s = process.env.JWT_SECRET || process.env.AI_KEY_ENC_SECRET || "";
  if (!s) throw new Error("Server is missing JWT_SECRET — cannot start the YouTube connection safely.");
  return crypto.createHash("sha256").update(`yt-oauth:${s}`).digest();
}
const b64u = (buf) => Buffer.from(buf).toString("base64url");
export function signYtState(payload, ttlMs = 15 * 60 * 1000) {
  const body = b64u(JSON.stringify({ ...payload, exp: Date.now() + ttlMs, n: crypto.randomBytes(8).toString("hex") }));
  const sig = b64u(crypto.createHmac("sha256", stateKey()).update(body).digest());
  return `${body}.${sig}`;
}
export function verifyYtState(state) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expect = b64u(crypto.createHmac("sha256", stateKey()).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data?.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

export function buildYtAuthUrl({ clientId, redirectUri, state }) {
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YT_SCOPES.join(" "),
    access_type: "offline", // → refresh token
    prompt: "consent",      // always return a refresh token, even on re-connect
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${qs.toString()}`;
}

function googleError(data, status, fallback) {
  const e = data?.error;
  const msg = typeof e === "string"
    ? [e, data?.error_description].filter(Boolean).join(": ")
    : (e?.errors?.[0]?.reason ? `${e.errors[0].reason}: ${e.message || ""}` : e?.message);
  return msg || `${fallback} (${status})`;
}

// code → { refreshToken, accessToken }
export async function exchangeYtCode({ code, clientId, clientSecret, redirectUri }) {
  const res = await ytFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(googleError(data, res.status, "Google token exchange failed"));
  return { refreshToken: data.refresh_token || "", accessToken: data.access_token };
}

// Short-lived access tokens, cached per refresh token (in memory).
const accessCache = new Map(); // fingerprint → { token, exp }
const fp = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 32);
export async function getYtAccessToken(cfg) {
  const key = fp(cfg.ytRefreshToken);
  const hit = accessCache.get(key);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  const res = await ytFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.ytClientId, client_secret: cfg.ytClientSecret, refresh_token: cfg.ytRefreshToken, grant_type: "refresh_token" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    accessCache.delete(key);
    if (data?.error === "invalid_grant") throw new Error("YouTube access was revoked or expired — click Connect YouTube again.");
    throw new Error(googleError(data, res.status, "Could not refresh the YouTube token"));
  }
  accessCache.set(key, { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

// The authorised user's channel { id, title } (or null).
export async function getYtChannel(accessToken) {
  const res = await ytFetch(`${API}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(googleError(data, res.status, "Could not read the YouTube channel"));
  const ch = data?.items?.[0];
  return ch ? { id: ch.id, title: ch.snippet?.title || "" } : null;
}

export async function revokeYtToken(refreshToken) {
  if (!refreshToken) return;
  await ytFetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }, 10000).catch(() => {});
}

export const encryptYtSecret = (v) => (v ? encryptSecret(v) : "");

// ---- Title / description helpers (pure) ----
// YouTube rejects "<" and ">" in titles/descriptions.
const clean = (s) => String(s || "").replace(/[<>]/g, "").replace(/\r/g, "");

// Fixed, numbered title: "Daily GK Quiz #12". The template may contain {n} to
// place the number; otherwise " #n" is appended. Max 100 chars.
export function buildYtTitle(template, n, fallback = "Daily Quiz") {
  const base = clean(template).replace(/\s+/g, " ").trim() || clean(fallback).trim() || "Daily Quiz";
  const num = Number.isInteger(n) && n > 0 ? n : null;
  let title = base.includes("{n}") ? base.replace(/\{n\}/g, num ?? "").replace(/\s*#\s*$/, "").trim() : (num ? `${base} #${num}` : base);
  if (title.length > 100) {
    const suffix = !base.includes("{n}") && num ? ` #${num}` : "";
    title = `${title.slice(0, 100 - suffix.length).trimEnd()}${suffix}`.slice(0, 100);
  }
  return title;
}

// Description = the post caption + #Shorts. YouTube caps descriptions at 5000 bytes.
export function buildYtDescription(caption) {
  let d = clean(caption).trim();
  if (!/#shorts\b/i.test(d)) d = `${d}${d ? "\n\n" : ""}#Shorts`;
  while (Buffer.byteLength(d, "utf8") > 5000) d = d.slice(0, -50);
  return d;
}

// Hashtags → YouTube tags (no "#", total ≤ 500 chars).
export function buildYtTags(text) {
  const tags = [];
  let total = 0;
  // \p{M} keeps combining marks (e.g. Hindi vowel signs) inside the tag.
  for (const m of String(text || "").matchAll(/#([\p{L}\p{M}\p{N}_]+)/gu)) {
    const t = m[1];
    if (/^shorts$/i.test(t) || tags.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    if (total + t.length + 1 > 500) break;
    tags.push(t); total += t.length + 1;
  }
  return tags;
}

function friendlyUploadError(msg, status) {
  const m = String(msg || "");
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(m)) return "YouTube API quota used up for today — it resets at midnight Pacific time.";
  if (/uploadLimitExceeded/i.test(m)) return "This YouTube channel hit its daily upload limit — try again tomorrow.";
  if (/youtubeSignupRequired/i.test(m)) return "This Google account has no YouTube channel yet — create one, then reconnect.";
  if (status === 401) return "YouTube login expired — click Connect YouTube again.";
  return m || `YouTube upload failed (${status}).`;
}

// Upload a hosted MP4 as a YouTube video/Short.
// Returns { ok, id?, url?, error? } — never throws.
export async function uploadVideoToYoutube({ videoUrl, title, description, tags = [], privacy = "public" }, cfg) {
  if (!isYoutubeConfigured(cfg)) return { ok: false, error: "YouTube is not connected." };
  const src = String(videoUrl || "").trim();
  if (!src) return { ok: false, error: "YouTube needs a video (turn on Reel, use AI Slideshow, or add a custom video)." };
  try {
    const accessToken = await getYtAccessToken(cfg);

    // 1) Download the finished MP4.
    const vid = await ytFetch(src, {}, 120000);
    if (!vid.ok) return { ok: false, error: `Could not download the video for YouTube (${vid.status}).` };
    const len = Number(vid.headers.get("content-length") || 0);
    if (len > MAX_VIDEO_BYTES) { try { await vid.body?.cancel?.(); } catch { /* ignore */ } return { ok: false, error: "Video is too large for YouTube auto-upload." }; }
    const bytes = Buffer.from(await vid.arrayBuffer());
    if (!bytes.length) return { ok: false, error: "The video file was empty." };
    if (bytes.length > MAX_VIDEO_BYTES) return { ok: false, error: "Video is too large for YouTube auto-upload." };
    const mime = /video\//i.test(vid.headers.get("content-type") || "") ? vid.headers.get("content-type").split(";")[0] : "video/mp4";

    // 2) Start a resumable session with the metadata.
    const meta = {
      snippet: { title, description, tags, categoryId: EDUCATION_CATEGORY },
      status: { privacyStatus: YT_PRIVACY.includes(privacy) ? privacy : "public", selfDeclaredMadeForKids: false, embeddable: true },
    };
    const start = await ytFetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(bytes.length),
      },
      body: JSON.stringify(meta),
    });
    if (!start.ok) {
      const d = await start.json().catch(() => ({}));
      return { ok: false, error: friendlyUploadError(googleError(d, start.status, "YouTube upload start failed"), start.status) };
    }
    const session = start.headers.get("location");
    if (!session) return { ok: false, error: "YouTube did not return an upload session." };

    // 3) Send the bytes (single request — Shorts are small).
    const put = await ytFetch(session, {
      method: "PUT",
      headers: { "Content-Type": mime, "Content-Length": String(bytes.length) },
      body: bytes,
    }, 180000);
    const data = await put.json().catch(() => ({}));
    if (!put.ok || !data?.id) return { ok: false, error: friendlyUploadError(googleError(data, put.status, "YouTube upload failed"), put.status) };
    return { ok: true, id: data.id, url: `https://youtube.com/shorts/${data.id}`, privacy: data?.status?.privacyStatus || meta.status.privacyStatus };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "YouTube upload timed out." : (e?.message || "Could not reach YouTube.") };
  }
}
