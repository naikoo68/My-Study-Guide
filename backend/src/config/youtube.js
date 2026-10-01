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
  // Playlists ("folders"): create a playlist and add each upload to it.
  "https://www.googleapis.com/auth/youtube.force-ssl",
];
// Scopes that allow creating playlists / adding videos to them.
const PLAYLIST_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube",
];
// Does a granted-scope string (space separated, from Google) allow playlists?
export function scopesAllowPlaylists(scopes) {
  const got = String(scopes || "").split(/\s+/);
  return PLAYLIST_SCOPES.some((s) => got.includes(s));
}
export const YT_THUMB_POSITIONS = ["left", "center", "right", "bottom"];
export const YT_THUMB_FONTS = ["sans", "serif", "mono", "anton", "bebas", "poppins", "oswald", "montserrat"];
export const DEFAULT_THUMB_BOX = { x: 0.05, y: 0.12, w: 0.56, h: 0.76 };
// Clean a thumbnail text box → { x, y, w, h } fractions kept on-frame (pure).
export function cleanThumbBox(b) {
  const f = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
  if (!b || typeof b !== "object") return { ...DEFAULT_THUMB_BOX };
  const x = f(b.x, DEFAULT_THUMB_BOX.x);
  const y = f(b.y, DEFAULT_THUMB_BOX.y);
  const w = Math.max(0.1, Math.min(1 - x, f(b.w, DEFAULT_THUMB_BOX.w)));
  const h = Math.max(0.1, Math.min(1 - y, f(b.h, DEFAULT_THUMB_BOX.h)));
  return { x, y, w, h };
}
// A YouTube playlist id ("PL…", "UU…", etc.) or "" — never anything else.
export const cleanYtPlaylistId = (v) => {
  const s = String(v || "").trim();
  return /^[A-Za-z0-9_-]{10,64}$/.test(s) ? s : "";
};
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
    // Default playlists ("folders") for Shorts and for long videos.
    ytShortsPlaylistId: String(site?.ytShortsPlaylistId || ""),
    ytShortsPlaylistTitle: String(site?.ytShortsPlaylistTitle || ""),
    ytLongPlaylistId: String(site?.ytLongPlaylistId || ""),
    ytLongPlaylistTitle: String(site?.ytLongPlaylistTitle || ""),
    // Thumbnail template for long videos.
    ytThumb: thumbConfigFromSite(site),
  };
}

// The thumbnail template settings (long videos) as a plain object.
// Clean a free-form text-box config (stored as one JSON object) — the SAME
// box + styling the thumbnail uses, for the intro / end / Short-end slides.
export function normalizeTextBox(o = {}, { defaultUseBox = false } = {}) {
  const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? v : d);
  const int = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const c = o && typeof o === "object" ? o : {};
  return {
    // OFF → the text is centred on the template (built-in layout); ON → the
    // draggable text box + styling below is used.
    useBox: c.useBox !== undefined ? !!c.useBox : defaultUseBox,
    showText: c.showText !== false,
    // Intro slides: which names to show AND say — "Subject — Topic", only the
    // subject, or only the topic. Both ON by default.
    showSubject: c.showSubject !== false,
    showTopic: c.showTopic !== false,
    box: cleanThumbBox(c.box),
    align: ["left", "center", "right"].includes(c.align) ? c.align : "center",
    vAlign: ["top", "center", "bottom"].includes(c.vAlign) ? c.vAlign : "center",
    font: YT_THUMB_FONTS.includes(c.font) ? c.font : "sans",
    uppercase: !!c.uppercase,
    headlineSize: int(c.headlineSize, 84, 24, 200),
    kickerSize: int(c.kickerSize, 44, 12, 120),
    badgeSize: int(c.badgeSize, 46, 12, 120),
    lineHeight: Math.max(0.8, Math.min(2, Number(c.lineHeight) || 1.1)),
    rotate: int(c.rotate, 0, -180, 180),
    textColor: col(c.textColor, "#0f172a"),
    kickerColor: col(c.kickerColor, ""),
    accentColor: col(c.accentColor, "#2563eb"),
    badgeTextColor: col(c.badgeTextColor, "#ffffff"),
    strokeColor: col(c.strokeColor, "#000000"),
    strokeWidth: int(c.strokeWidth, 0, 0, 16),
    shadow: c.shadow !== false,
    panelColor: col(c.panelColor, ""),
    panelOpacity: int(c.panelOpacity, 0, 0, 100),
    panelRadius: int(c.panelRadius, 24, 0, 80),
    // What the narrator says on this slide ("" = the built-in default line).
    narration: String(c.narration ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
    // On-screen time in seconds. 0 = auto: the slide ends right after the
    // narration. A longer narration is never cut off.
    seconds: int(c.seconds, 0, 0, 60),
  };
}
// The saved text-box + template for a long-video slide role.
// intro / outro are 16:9 (full video); shortintro / shortoutro are 9:16 (the Short).
const SLIDE_ROLE_FIELD = { intro: "Intro", outro: "Outro", shortintro: "ShortIntro", shortoutro: "ShortOutro" };
export const SLIDE_TEXT_ROLES = Object.keys(SLIDE_ROLE_FIELD);
export const isVerticalSlideRole = (role) => role === "shortintro" || role === "shortoutro";
export function slideTextConfigFromSite(site, role) {
  const F = SLIDE_ROLE_FIELD[role];
  if (!F) return null;
  // The movable box defaults ON for the intro (opening title), OFF for the end
  // slides — those stay centred on the template unless the admin turns it on.
  return {
    ...normalizeTextBox(site?.[`longVideo${F}Text`] || {}, { defaultUseBox: role === "intro" || role === "shortintro" }),
    templateUrl: String(site?.[`longVideo${F}TemplateUrl`] || "").trim(),
  };
}

export function thumbConfigFromSite(site) {
  const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? v : d);
  const int = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  return {
    templateUrl: String(site?.ytThumbTemplateUrl || "").trim(),
    enabled: site?.ytThumbEnabled !== false,
    showText: site?.ytThumbShowText !== false,
    position: YT_THUMB_POSITIONS.includes(site?.ytThumbTextPosition) ? site.ytThumbTextPosition : "left",
    // Where the text sits (the template's empty area) + full styling.
    box: cleanThumbBox(site?.ytThumbBox),
    align: ["left", "center", "right"].includes(site?.ytThumbAlign) ? site.ytThumbAlign : "left",
    vAlign: ["top", "center", "bottom"].includes(site?.ytThumbVAlign) ? site.ytThumbVAlign : "center",
    font: YT_THUMB_FONTS.includes(site?.ytThumbFont) ? site.ytThumbFont : "sans",
    uppercase: !!site?.ytThumbUppercase,
    headlineSize: int(site?.ytThumbHeadlineSize, 104, 24, 200),
    kickerSize: int(site?.ytThumbKickerSize, 44, 12, 120),
    badgeSize: int(site?.ytThumbBadgeSize, 46, 12, 120),
    lineHeight: Math.max(0.8, Math.min(2, Number(site?.ytThumbLineHeight) || 1.05)),
    rotate: int(site?.ytThumbRotate, 0, -180, 180),
    textColor: col(site?.ytThumbTextColor, "#ffffff"),
    kickerColor: col(site?.ytThumbKickerColor, ""),
    accentColor: col(site?.ytThumbAccentColor, "#facc15"),
    badgeTextColor: col(site?.ytThumbBadgeTextColor, "#111111"),
    strokeColor: col(site?.ytThumbStrokeColor, "#000000"),
    strokeWidth: int(site?.ytThumbStrokeWidth, 3, 0, 16),
    shadow: site?.ytThumbShadow !== false,
    panelColor: col(site?.ytThumbPanelColor, ""),
    panelOpacity: int(site?.ytThumbPanelOpacity, 0, 0, 100),
    panelRadius: int(site?.ytThumbPanelRadius, 24, 0, 80),
  };
}
// Is a thumbnail template set and switched on?
export const thumbTemplateActive = (t) => !!(t?.enabled && t?.templateUrl);

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
    // consent: always return a refresh token, even on re-connect.
    // select_account: always show the account / Brand-channel chooser, so the
    // browser's already-signed-in Gmail isn't silently used for the wrong channel.
    prompt: "consent select_account",
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
  return { refreshToken: data.refresh_token || "", accessToken: data.access_token, scope: String(data.scope || "") };
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
  accessCache.set(key, { token: data.access_token, scope: String(data.scope || ""), exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

// The scopes Google granted this connection ("" when not known yet).
export async function getYtGrantedScopes(cfg) {
  await getYtAccessToken(cfg);
  return accessCache.get(fp(cfg.ytRefreshToken))?.scope || "";
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
export function buildYtDescription(caption, followLinks = "") {
  let d = clean(caption).trim();
  if (followLinks) d = `${d}${d ? "\n\n" : ""}${clean(followLinks).trim()}`;
  if (!/#shorts\b/i.test(d)) d = `${d}${d ? "\n\n" : ""}#Shorts`;
  while (Buffer.byteLength(d, "utf8") > 5000) d = d.slice(0, -50);
  return d;
}

// Hashtags → YouTube tags (no "#", total ≤ 500 chars).
// `first` — plain-word tags put in FRONT (e.g. the subject and topic names
// "Economics", "Characteristics and Problems of Developing Economy"), so they're
// never cut by the 500-character limit. YouTube counts a tag with spaces as
// its length + 2 (it's quoted).
export function buildYtTags(text, { first = [] } = {}) {
  const tags = [];
  let total = 0;
  const key = (t) => t.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
  for (const raw of first || []) {
    const t = String(raw || "").replace(/[<>,"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
    if (!t || tags.some((x) => key(x) === key(t))) continue;
    const cost = t.length + (/\s/.test(t) ? 3 : 1);
    if (total + cost > 500) break;
    tags.push(t); total += cost;
  }
  // \p{M} keeps combining marks (e.g. Hindi vowel signs) inside the tag.
  for (const m of String(text || "").matchAll(/#([\p{L}\p{M}\p{N}_]+)/gu)) {
    const t = m[1];
    if (/^shorts$/i.test(t) || tags.some((x) => key(x) === key(t))) continue;
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

// Default title for a long quiz video that holds the WHOLE quiz:
// "Economics | Characteristics and Problems of Developing Economy | Quiz 1 (25 Questions)".
// (A video with only PART of the quiz uses DEFAULT_YT_SERIES_TITLE in
// config/longVideo.js: "… | Quiz 1 (Part 1) (25 Questions)".) Never "Full Quiz".
export const DEFAULT_YT_LONG_TITLE = "{subject} | {topic} | {quiz} ({count} Questions)";
// The same when the source is a whole topic (no single quiz name).
export const DEFAULT_YT_LONG_TITLE_NOQUIZ = "{subject} | {topic} ({count} Questions)";

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
// A YouTube Short must be 3 minutes or less.
export const YT_SHORT_MAX_SEC = 180;
// `title` (optional) is the FIRST line — the video's title, then a blank line.
// `followLinks` — the "Follow us" block (social links), placed before the hashtags.
export function buildYtLongDescription({ title = "", intro = "", chapters = [], hashtags = "", siteUrl = "", shorts = false, followLinks = "" } = {}) {
  const lines = [];
  if (title) { lines.push(clean(title).trim()); if (intro) lines.push(""); }
  if (intro) lines.push(clean(intro).trim());
  const ch = (Array.isArray(chapters) ? chapters : []).filter((c) => Number.isFinite(Number(c?.startSec)));
  const ok = ch.length >= 3 && ch.every((c, i) => i === 0 || Number(c.startSec) - Number(ch[i - 1].startSec) >= 10);
  if (ok) {
    lines.push("");
    lines.push("Chapters:");
    ch.forEach((c, i) => lines.push(`${ytTimestamp(i === 0 ? 0 : c.startSec)} ${clean(c.label || `Question ${c.question || i + 1}`)}`));
  }
  if (siteUrl && !followLinks) { lines.push(""); lines.push(`Practice more quizzes: ${siteUrl}`); }
  if (followLinks) { lines.push(""); lines.push(clean(followLinks).trim()); }
  // #Shorts hint (only when the video qualifies — see YT_SHORT_MAX_SEC).
  const tagLine = [shorts ? "#Shorts" : "", clean(hashtags).trim()].filter(Boolean).join(" ");
  if (tagLine) { lines.push(""); lines.push(tagLine); }
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


// ---- Playlists ("folders") ----

const playlistScopeError = (m) => /insufficient|ACCESS_TOKEN_SCOPE|forbidden|403/i.test(String(m || ""));
const PLAYLIST_RECONNECT = "Playlists need one more YouTube permission — click Reconnect YouTube (YouTube Shorts card) and allow access again.";

// The channel's playlists [{ id, title, privacy, count }] (newest first, ≤ 200).
export async function listYtPlaylists(cfg) {
  const token = await getYtAccessToken(cfg);
  const out = [];
  let pageToken = "";
  for (let i = 0; i < 4; i++) {
    const qs = new URLSearchParams({ part: "snippet,status,contentDetails", mine: "true", maxResults: "50" });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await ytFetch(`${API}/playlists?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(googleError(data, res.status, "Could not load your YouTube playlists"));
    for (const p of data.items || []) {
      out.push({ id: p.id, title: p.snippet?.title || "(untitled)", privacy: p.status?.privacyStatus || "", count: Number(p.contentDetails?.itemCount) || 0 });
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return out;
}

// Create a playlist → { id, title, privacy }.
export async function createYtPlaylist({ title, description = "", privacy = "public" }, cfg) {
  const name = clean(title).replace(/\s+/g, " ").trim().slice(0, 150);
  if (!name) throw new Error("Give the playlist a name.");
  const token = await getYtAccessToken(cfg);
  const res = await ytFetch(`${API}/playlists?part=snippet,status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      snippet: { title: name, description: clean(description).slice(0, 5000) },
      status: { privacyStatus: YT_PRIVACY.includes(privacy) ? privacy : "public" },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) {
    const m = googleError(data, res.status, "Could not create the playlist");
    throw new Error(res.status === 403 && playlistScopeError(m) ? PLAYLIST_RECONNECT : m);
  }
  return { id: data.id, title: data.snippet?.title || name, privacy: data.status?.privacyStatus || privacy, count: 0 };
}

// Add a video to a playlist. Returns { ok, error? } — never throws.
export async function addVideoToYtPlaylist({ videoId, playlistId }, cfg) {
  if (!videoId || !playlistId) return { ok: false, error: "No playlist chosen." };
  try {
    const token = await getYtAccessToken(cfg);
    const res = await ytFetch(`${API}/playlistItems?part=snippet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const m = googleError(data, res.status, "Could not add the video to the playlist");
    if (res.status === 404 || /playlistNotFound/i.test(m)) return { ok: false, error: "The chosen playlist no longer exists — pick another one." };
    return { ok: false, error: res.status === 403 && playlistScopeError(m) ? PLAYLIST_RECONNECT : m };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not reach YouTube." };
  }
}

// ---- Thumbnails ----

// Set a video's custom thumbnail from image bytes (JPEG/PNG ≤ 2 MB).
// Returns { ok, error? } — never throws.
export async function setYtThumbnail({ videoId, image, mime = "image/jpeg" }, cfg) {
  if (!videoId || !image?.length) return { ok: false, error: "No thumbnail image." };
  if (image.length > 2 * 1024 * 1024) return { ok: false, error: "Thumbnail is larger than YouTube's 2 MB limit." };
  try {
    const token = await getYtAccessToken(cfg);
    const res = await ytFetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": mime, "Content-Length": String(image.length) },
      body: image,
    }, 60000);
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const m = googleError(data, res.status, "Could not set the thumbnail");
    if (res.status === 403) return { ok: false, error: "Custom thumbnails need a verified channel (youtube.com/verify) — the thumbnail was not set." };
    return { ok: false, error: m };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not reach YouTube." };
  }
}

// The ONLY text that changes on the (one-time uploaded) thumbnail template:
//   kicker   = subject          e.g. "Academic Librarianship"
//   headline = topic            e.g. "Library Management and Administration"
//   badge    = quiz             e.g. "Quiz 2"
// With no quiz (a whole topic) the badge says how many questions ("25
// Questions", or "Questions 26–50" for a part). A missing topic moves the quiz
// (or subject) up to the headline so nothing is left blank. Pure — tested.
export function thumbnailLines({ subject = "", topic = "", quiz = "", count = 0, range = "", title = "" } = {}) {
  const tidy = (s) => clean(s).replace(/\s+/g, " ").trim();
  const s = tidy(subject), t = tidy(topic), qz = tidy(quiz);
  if (s || t || qz) {
    const countBadge = range ? `Questions ${tidy(range)}` : Number(count) > 0 ? `${Number(count)} Questions` : "Full Quiz";
    const headline = t || qz || s;
    return {
      kicker: (headline === s ? "" : s).slice(0, 60),
      headline: headline.slice(0, 80),
      badge: (qz && headline !== qz ? qz : countBadge).slice(0, 40),
    };
  }
  // Only a title (e.g. your own upload): split "A | B | C" into kicker/headline/badge.
  const parts = tidy(title).split(/\s*[|•·–—]\s*/).filter(Boolean);
  if (parts.length >= 3) return { kicker: parts[0].slice(0, 60), headline: parts[1].slice(0, 80), badge: parts.slice(2).join(" · ").slice(0, 40) };
  if (parts.length === 2) return { kicker: parts[0].slice(0, 60), headline: parts[1].slice(0, 80), badge: "" };
  return { kicker: "", headline: (parts[0] || "").slice(0, 80), badge: "" };
}


// After an upload: set the template thumbnail (optional) and add the video to
// a playlist (optional). Returns human-readable notes, e.g.
// ["Thumbnail ✓", "Playlist ✓ (Polity)"]. Never throws.
//   thumb     — { lines, ...thumbConfig } or null (skip)
//   playlist  — { id, title } or null (skip)
export async function applyYtExtras({ videoId, thumb = null, playlist = null, brandColor } = {}, cfg) {
  const notes = [];
  if (!videoId) return notes;
  if (thumb && thumbTemplateActive(thumb)) {
    const { renderYoutubeThumbnail } = await import("./ytThumbnail.js");
    const r = await renderYoutubeThumbnail({ ...thumb, brandColor });
    if (r.image) {
      const s = await setYtThumbnail({ videoId, image: r.image, mime: r.mime }, cfg);
      notes.push(s.ok ? "Thumbnail ✓" : `Thumbnail ✗ (${s.error})`);
    } else notes.push(`Thumbnail ✗ (${r.error})`);
  }
  if (playlist?.id) {
    const p = await addVideoToYtPlaylist({ videoId, playlistId: playlist.id }, cfg);
    notes.push(p.ok ? `Playlist ✓${playlist.title ? ` (${clean(playlist.title)})` : ""}` : `Playlist ✗ (${p.error})`);
  }
  return notes;
}

// Post a top-level comment on one of the channel's videos (commentThreads.insert,
// needs the youtube.force-ssl scope). Used to put the full video's link under
// the Short. NOTE: the YouTube API cannot PIN a comment — pin it in YouTube
// Studio / the app (two taps). Returns { ok, id?, error? }; never throws.
export async function commentOnYoutubeVideo({ videoId, text } = {}, cfg) {
  if (!isYoutubeConfigured(cfg)) return { ok: false, error: "YouTube is not connected." };
  const id = String(videoId || "").trim();
  const msg = String(text || "").trim().slice(0, 10000);
  if (!id || !msg) return { ok: false, error: "A video id and comment text are both required." };
  try {
    const token = await getYtAccessToken(cfg);
    const res = await ytFetch(`${API}/commentThreads?part=snippet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: msg } } } }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.id) return { ok: true, id: String(data.id) };
    const reason = data?.error?.errors?.[0]?.reason || "";
    if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(`${reason} ${data?.error?.message || ""}`)) {
      return { ok: false, error: "needs the comment permission — click Reconnect YouTube once" };
    }
    if (/commentsDisabled/i.test(reason)) return { ok: false, error: "comments are turned off on this video" };
    return { ok: false, error: googleError(data, res.status, "Could not add the comment") };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not reach YouTube." };
  }
}
