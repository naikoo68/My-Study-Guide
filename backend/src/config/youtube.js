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

// Default YouTube title: "Subject | Topic | Quiz N" — e.g. a 25-question topic
// posted 5 questions per video becomes Quiz 1 … Quiz 5.
export const DEFAULT_YT_TITLE = "{subject} | {topic} | Quiz {n}";
const TITLE_VARS = /\{(subject|topic|quiz|n|total|count)\}/i;

// Build the video title from a template. Placeholders: {subject} {topic}
// {quiz} (quiz/test name) {n} (quiz number) {total} (quizzes in the topic)
// {count} (number of questions in the video).
// Blank template → DEFAULT_YT_TITLE. A plain title with no placeholders gets
// " #n" appended ("Daily GK Quiz #12"). Empty parts are dropped cleanly and the
// result is capped at YouTube's 100 chars while keeping the quiz number.
export function buildYtTitle(template, vars = {}, fallback = "Daily Quiz") {
  const v = typeof vars === "number" ? { n: vars } : (vars || {});
  const num = Number.isInteger(v.n) && v.n > 0 ? v.n : null;
  const tidy = (s) => clean(s).replace(/\s+/g, " ").trim();
  const tpl = tidy(template) || DEFAULT_YT_TITLE;

  if (!TITLE_VARS.test(tpl)) {
    const base = tpl || tidy(fallback) || "Daily Quiz";
    const suffix = num ? ` #${num}` : "";
    return `${base.slice(0, 100 - suffix.length).trimEnd()}${suffix}`;
  }

  const values = {
    subject: tidy(v.subject),
    topic: tidy(v.topic),
    quiz: tidy(v.quiz),
    n: num ? String(num) : "",
    total: Number.isInteger(v.total) && v.total > 0 ? String(v.total) : "",
    count: Number.isInteger(v.count) && v.count > 0 ? String(v.count) : "",
  };
  // Split into parts on " | " (or • · – —) so an empty part (e.g. no topic)
  // is dropped instead of leaving "Polity |  | Quiz 1".
  const VAR_G = /\{(subject|topic|quiz|n|total|count)\}/gi;
  const segs = tpl.split(/\s*[|•·–—]\s*/).filter((s) => s.trim());
  const parts = [];
  for (const seg of segs) {
    const keys = [...seg.matchAll(VAR_G)].map((m) => m[1].toLowerCase());
    if (keys.length && keys.every((k) => !values[k])) continue; // all its placeholders are empty
    const text = seg.replace(VAR_G, (_, k) => values[k.toLowerCase()])
      .replace(/\s*(?:of|\/)\s*$/i, "") // "Quiz 3 of " when {total} is unknown
      .replace(/\s+/g, " ").trim();
    if (text) parts.push({ text, numbered: keys.includes("n") || keys.includes("count") });
  }
  if (!parts.length) return num ? `${tidy(fallback) || "Daily Quiz"} #${num}` : (tidy(fallback) || "Daily Quiz");

  const title = parts.map((p) => p.text).join(" | ");
  if (title.length <= 100) return title;
  // Too long: keep the numbered part ("Quiz 3") whole and shorten the rest.
  const tail = parts.find((p) => p.numbered);
  if (!tail) return title.slice(0, 100).trimEnd();
  const head = parts.filter((p) => p !== tail).map((p) => p.text).join(" | ");
  const room = 100 - tail.text.length - 3;
  return `${head.slice(0, Math.max(0, room)).trimEnd()} | ${tail.text}`.slice(0, 100);
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


// ---- Long (normal, 16:9) videos ----

// Default title for a full-topic quiz video.
export const DEFAULT_YT_LONG_TITLE = "{subject} | {topic} | Full Quiz ({count} Questions)";

// "m:ss" / "h:mm:ss" for YouTube chapter timestamps.
export function ytTimestamp(sec) {
  const t = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// Description for a long quiz video: intro, clickable chapters (one per
// question — YouTube needs ≥3 chapters, the first at 0:00, each ≥10 s), then
// the hashtags. No #Shorts. Max 5000 bytes.
export function buildYtLongDescription({ intro = "", chapters = [], hashtags = "", siteUrl = "" } = {}) {
  const lines = [];
  if (intro) lines.push(clean(intro).trim());
  const ch = (Array.isArray(chapters) ? chapters : []).filter((c) => Number.isFinite(Number(c?.startSec)));
  const ok = ch.length >= 3 && ch.every((c, i) => i === 0 || Number(c.startSec) - Number(ch[i - 1].startSec) >= 10);
  if (ok) {
    lines.push("");
    lines.push("Chapters:");
    ch.forEach((c, i) => lines.push(`${ytTimestamp(i === 0 ? 0 : c.startSec)} ${clean(c.label || `Question ${c.question || i + 1}`)}`));
  }
  if (siteUrl) { lines.push(""); lines.push(`Practice more quizzes: ${siteUrl}`); }
  if (hashtags) { lines.push(""); lines.push(clean(hashtags).trim()); }
  let d = lines.join("\n").trim();
  while (Buffer.byteLength(d, "utf8") > 5000) d = d.slice(0, -50);
  return d;
}

// Upload a LOCAL video file (a long, 16:9 video) through the resumable API in
// chunks, so big files never sit in memory. Optional `publishAt` (ISO date in
// the future) schedules it: YouTube keeps it private and publishes it then.
// Returns { ok, id?, url?, privacy?, error? } — never throws.
const CHUNK = 16 * 1024 * 1024; // multiple of 256 KiB, as the API requires
export async function uploadVideoFileToYoutube({ filePath, title, description, tags = [], privacy = "public", publishAt = null, onProgress = null }, cfg) {
  if (!isYoutubeConfigured(cfg)) return { ok: false, error: "YouTube is not connected." };
  const fsp = await import("node:fs/promises");
  let fh;
  try {
    const { size } = await fsp.stat(filePath);
    if (!size) return { ok: false, error: "The video file is empty." };
    const accessToken = await getYtAccessToken(cfg);
    const when = publishAt ? new Date(publishAt) : null;
    const scheduled = when && !isNaN(when.getTime()) && when.getTime() > Date.now() + 60000;
    const meta = {
      snippet: { title, description, tags, categoryId: EDUCATION_CATEGORY },
      status: {
        // A scheduled video must be uploaded as private; YouTube flips it at publishAt.
        privacyStatus: scheduled ? "private" : (YT_PRIVACY.includes(privacy) ? privacy : "public"),
        ...(scheduled ? { publishAt: when.toISOString() } : {}),
        selfDeclaredMadeForKids: false,
        embeddable: true,
      },
    };
    const start = await ytFetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify(meta),
    });
    if (!start.ok) {
      const d = await start.json().catch(() => ({}));
      return { ok: false, error: friendlyUploadError(googleError(d, start.status, "YouTube upload start failed"), start.status) };
    }
    const session = start.headers.get("location");
    if (!session) return { ok: false, error: "YouTube did not return an upload session." };

    fh = await fsp.open(filePath, "r");
    let offset = 0;
    let retries = 0;
    while (offset < size) {
      const len = Math.min(CHUNK, size - offset);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, offset);
      let res;
      try {
        res = await ytFetch(session, {
          method: "PUT",
          headers: { "Content-Length": String(len), "Content-Range": `bytes ${offset}-${offset + len - 1}/${size}` },
          body: buf,
        }, 300000);
      } catch (e) {
        if (++retries > 5) throw e;
        await new Promise((r) => setTimeout(r, 2000 * retries));
        // Ask YouTube how much it has, then continue from there.
        const q = await ytFetch(session, { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${size}` } }).catch(() => null);
        const got = q?.headers?.get("range");
        offset = got ? Number(got.split("-")[1]) + 1 : offset;
        continue;
      }
      if (res.status === 308) {
        const got = res.headers.get("range");
        offset = got ? Number(got.split("-")[1]) + 1 : offset + len;
        retries = 0;
        if (typeof onProgress === "function") onProgress(offset, size);
        continue;
      }
      if ([500, 502, 503, 504].includes(res.status) && ++retries <= 5) {
        await new Promise((r) => setTimeout(r, 2000 * retries));
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.id) return { ok: false, error: friendlyUploadError(googleError(data, res.status, "YouTube upload failed"), res.status) };
      if (typeof onProgress === "function") onProgress(size, size);
      return { ok: true, id: data.id, url: `https://www.youtube.com/watch?v=${data.id}`, privacy: data?.status?.privacyStatus || meta.status.privacyStatus, publishAt: scheduled ? when.toISOString() : null };
    }
    return { ok: false, error: "YouTube upload ended unexpectedly." };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "YouTube upload timed out." : (e?.message || "Could not reach YouTube.") };
  } finally {
    await fh?.close().catch(() => {});
  }
}
