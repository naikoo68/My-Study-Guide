// Facebook / Instagram Graph API helper — verifies page credentials and publishes
// auto-posts to a connected Facebook page / Instagram account.

import Settings from "../models/Settings.js";
import User from "../models/User.js";
import { sendMail } from "./mailer.js";
import { toInstagramSafeUrl } from "../utils/instagramImage.js";
import { toFacebookSafeUrl } from "../utils/facebookImage.js";

// Facebook Page auto-posting via the Graph API. The Page ID + long-lived Page
// access token are stored in the singleton Settings document (entered by the
// admin in the panel) and NEVER exposed to the browser. Outbound calls use the
// global fetch (Node 18+), matching the mailer's HTTP style.

// `filter` optionally targets a specific tenant's settings (e.g. { tenantId })
// so the background scheduler can load each institute's OWN Facebook credentials
// robustly even when running without a request/tenant context. In a normal
// request it's omitted and the tenant plugin scopes to the caller's institute.
export async function getFacebookConfig(filter) {
  const s = await Settings.findOne({ key: "site", ...(filter || {}) }).lean();
  return {
    enabled: !!s?.fbEnabled,
    pageId: String(s?.fbPageId || "").trim(),
    token: String(s?.fbPageAccessToken || "").trim(),
    version: String(s?.fbGraphVersion || "v21.0").trim() || "v21.0",
    autoOnNotice: !!s?.fbAutoOnNotice,
    siteUrl: String(process.env.CLIENT_URL || "").replace(/\/$/, ""),
    igEnabled: !!s?.igEnabled,
    igUserId: String(s?.igUserId || "").trim(),
  };
}

export const isFacebookConfigured = (cfg) => !!(cfg?.pageId && cfg?.token);

// fetch() with a HARD timeout. A stalled Facebook/Instagram request used to hang
// forever, which froze the auto-post scheduler: its "busy" guard never cleared,
// so NO timed post ran again until the server restarted — even though the manual
// "Post now" button (which bypasses the scheduler) still worked. Aborting after
// `timeoutMs` turns a hang into a normal, recorded failure the tick recovers from.
async function fbFetch(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Instagram creates media ASYNCHRONOUSLY: after a container is created, Instagram
// must finish DOWNLOADING and PROCESSING the image (from image_url) before the
// container can be published. Calling media_publish too early fails with
// "Media ID is not available" — an intermittent error that hits whichever post
// loses the race. Poll the container's status_code until it reports FINISHED
// (or a terminal ERROR/EXPIRED) before we attempt to publish.
async function waitForIgContainerReady(cfg, containerId, token, { tries = 15, delayMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    let data = {};
    try {
      const res = await fbFetch(
        `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`
      );
      data = await res.json().catch(() => ({}));
    } catch {
      /* transient network hiccup — fall through and retry */
    }
    const code = data?.status_code;
    if (code === "FINISHED") return { ok: true };
    if (code === "ERROR" || code === "EXPIRED") {
      return { ok: false, error: data?.status || `Instagram could not process the media (${String(code).toLowerCase()}).` };
    }
    // IN_PROGRESS / unknown — wait and poll again.
    await sleep(delayMs);
  }
  return { ok: false, error: "Instagram media did not finish processing in time." };
}

// Posting to a Page requires a PAGE access token. Admins often paste a USER
// token by mistake (which triggers the deprecated "publish_actions" error).
// This resolves the correct Page token from whatever was saved: querying the
// Page node with a user OR page token returns the Page's own token. Cached
// briefly to avoid an extra call on every post.
const _pageTokenCache = new Map();
export async function resolvePageToken(cfg) {
  const key = `${cfg.pageId}:${String(cfg.token).slice(0, 16)}`;
  const hit = _pageTokenCache.get(key);
  if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.token;
  try {
    const res = await fbFetch(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}?fields=access_token&access_token=${encodeURIComponent(cfg.token)}`);
    const data = await res.json().catch(() => ({}));
    const token = data?.access_token || cfg.token;
    _pageTokenCache.set(key, { token, ts: Date.now() });
    return token;
  } catch {
    return cfg.token;
  }
}

// Post a message (with an optional link) to the configured Facebook Page feed.
// Returns { ok, id?, error? }. Safe to call fire-and-forget — it never throws.
export async function postToFacebookPage({ message, link, imageUrl } = {}, cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook Page ID or access token is not set." };

  const msg = String(message || "").trim();
  const lnk = String(link || "").trim();
  const img = String(imageUrl || "").trim();
  if (!msg && !lnk && !img) return { ok: false, error: "Nothing to post (empty message)." };

  // With an image → post a PHOTO (message becomes the caption); otherwise a
  // normal feed post (optionally with a link).
  const endpoint = img ? "photos" : "feed";
  const url = `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}/${endpoint}`;
  const pageToken = await resolvePageToken(cfg); // ensure a PAGE token (not a user token)
  const body = new URLSearchParams();
  if (img) { body.set("url", img); if (msg) body.set("caption", msg); }
  else { if (msg) body.set("message", msg); if (lnk) body.set("link", lnk); }
  body.set("access_token", pageToken);

  try {
    const res = await fbFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && (data.id || data.post_id)) return { ok: true, id: data.post_id || data.id };
    let error = data?.error?.message || `Facebook API error (${res.status}).`;
    if (/publish_actions|\(#200\)/i.test(error)) {
      error = "Facebook rejected the token. Use a PAGE access token (not a User token) with the pages_manage_posts permission, then save again. " + error;
    }
    return { ok: false, error };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Facebook." };
  }
}

// Resolve the Instagram Business account id linked to the Facebook Page. Uses
// the configured igUserId if set, else auto-detects it from the Page.
export async function getInstagramUserId(cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (cfg.igUserId) return cfg.igUserId;
  if (!isFacebookConfigured(cfg)) return null;
  try {
    const res = await fbFetch(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}?fields=instagram_business_account&access_token=${encodeURIComponent(cfg.token)}`);
    const data = await res.json().catch(() => ({}));
    return data?.instagram_business_account?.id || null;
  } catch {
    return null;
  }
}

// Post a single image with caption to Instagram (create container → publish).
// Instagram REQUIRES an image. Returns { ok, id?, error? }.
export async function postToInstagram({ imageUrl, caption } = {}, cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook/Instagram is not connected." };
  const img = String(imageUrl || "").trim();
  if (!img) return { ok: false, error: "Instagram needs an image to post." };
  const igId = await getInstagramUserId(cfg);
  if (!igId) return { ok: false, error: "No Instagram Business account is linked to this Facebook Page." };
  const pageToken = await resolvePageToken(cfg); // IG publishing uses the Page token

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  try {
    // 1) Create a media container.
    const c = new URLSearchParams();
    c.set("image_url", img);
    if (caption) c.set("caption", String(caption).slice(0, 2100));
    c.set("access_token", pageToken);
    const cRes = await fbFetch(`https://graph.facebook.com/${cfg.version}/${igId}/media`, { method: "POST", headers, body: c });
    const cData = await cRes.json().catch(() => ({}));
    if (!cRes.ok || !cData.id) return { ok: false, error: cData?.error?.message || `Instagram container error (${cRes.status}).` };

    // 2) Wait for the container to finish processing BEFORE publishing —
    // publishing early is what triggers the "Media ID is not available" error.
    const ready = await waitForIgContainerReady(cfg, cData.id, pageToken);
    if (!ready.ok) return { ok: false, error: ready.error };

    // 3) Publish the container. Even once FINISHED, Instagram can briefly report
    // "Media ID is not available" due to propagation lag, so retry a few times.
    const p = new URLSearchParams();
    p.set("creation_id", cData.id);
    p.set("access_token", pageToken);
    let pData = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      const pRes = await fbFetch(`https://graph.facebook.com/${cfg.version}/${igId}/media_publish`, { method: "POST", headers, body: p });
      pData = await pRes.json().catch(() => ({}));
      if (pRes.ok && pData.id) return { ok: true, id: pData.id };
      const msg = String(pData?.error?.message || "");
      // Only retry the transient "not available/ready" case; bail on real errors.
      if (!/not available|not ready/i.test(msg)) break;
      await sleep(2000);
    }
    return { ok: false, error: pData?.error?.message || `Instagram publish error.` };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Instagram." };
  }
}

// Verify the token/page WITHOUT posting — reads the Page name via the Graph API.
export async function verifyFacebook(cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Add your Page ID and Page access token first." };
  try {
    const res = await fbFetch(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}?fields=name&access_token=${encodeURIComponent(cfg.token)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.name) return { ok: true, name: data.name };
    return { ok: false, error: data?.error?.message || `Facebook API error (${res.status}).` };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Facebook." };
  }
}


// ---------------------------------------------------------------------------
// Scheduled question auto-posting (independent of the Notice Board).
// ---------------------------------------------------------------------------
import FbSchedule from "../models/FbSchedule.js";
import Question from "../models/Question.js";
import Subject from "../models/Subject.js";
import Session from "../models/Session.js";
import Topic from "../models/Topic.js";
import Quiz from "../models/Quiz.js";
import Stream from "../models/Stream.js";
import TestSeries from "../models/TestSeries.js";
import { renderQuestionImage } from "./socialImage.js";
import { renderQuestionCardShot } from "./cardShot.js";
import { tenantStore, runUnscoped } from "../utils/tenantContext.js";
import { getDefaultTenantId } from "../utils/platformScope.js";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Strip inline-LaTeX $…$ markers so the post reads as plain text on Facebook.
const plain = (s) => String(s || "").replace(/\$/g, "").replace(/[ \t]+\n/g, "\n").trim();

// Turn a label ("Physiography of J&K") into a CamelCase hashtag ("#PhysiographyOfJK").
function toTagWords(s) {
  const words = String(s || "").replace(/[^a-zA-Z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return "#" + words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
// Normalise an admin-typed tag ("economics" / "#Economics" → "#Economics").
function normTag(s) {
  const t = String(s || "").trim().replace(/^#+/, "").replace(/[^a-zA-Z0-9_]/g, "");
  return t ? "#" + t : "";
}

// Build the hashtag string for a question: per-post tags + the admin's global
// default tags + auto tags from the question's subject / topic / section.
// `site` is the Settings doc (fbDefaultHashtags, fbAutoHashtags).
export async function hashtagsForQuestion(q, site, extra = "") {
  const out = [];
  const push = (t) => { if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t); };
  for (const w of String(extra || "").split(/[\s,]+/)) push(normTag(w));
  for (const w of String(site?.fbDefaultHashtags || "").split(/[\s,]+/)) push(normTag(w));
  if (site?.fbAutoHashtags !== false && q) {
    let subjectName = "";
    let topicName = "";
    if (q.subject) {
      const s = await Subject.findById(q.subject).select("name").lean().catch(() => null);
      subjectName = s?.name || "";
    }
    // Look up the Topic name from the session hierarchy (Question → Session → Topic).
    // Falls back to q.topic (a plain string field used by test-series questions).
    let sessionId = q.session;
    if (!sessionId && q.quiz) {
      // Question linked to a quiz but not directly to a session — get session from quiz.
      const qz = await Quiz.findById(q.quiz).select("session").lean().catch(() => null);
      sessionId = qz?.session || null;
    }
    if (sessionId) {
      const sess = await Session.findById(sessionId).select("topic").lean().catch(() => null);
      if (sess?.topic) {
        const t = await Topic.findById(sess.topic).select("title").lean().catch(() => null);
        topicName = t?.title || "";
      }
    }
    if (!topicName && q.topic) topicName = q.topic;
    push(toTagWords(subjectName));
    push(toTagWords(topicName));
    push(toTagWords(q.section));
  }
  // Cap the number of hashtags. A huge wall of tags is treated as spam by
  // Facebook (which then stops turning the extras into blue links) and exceeds
  // Instagram's hard 30-hashtag limit — so keep the first 30 (per-post + global
  // defaults + auto tags), which all reliably render as clickable links.
  return out.slice(0, MAX_HASHTAGS).join(" ");
}

// The most hashtags we emit per post. Facebook stops hyperlinking huge tag
// walls and Instagram rejects more than 30, so 30 keeps every tag clickable.
const MAX_HASHTAGS = 30;

// Build the "Stream › Subject › Topic › Quiz" drill-down trail for a question,
// shown as a small context line at the top of the post. Uses the same lookups
// as the hashtag builder (subject → stream, session → topic, quiz title).
export async function breadcrumbForQuestion(q) {
  if (!q) return "";
  let streamName = "", subjectName = "", topicName = "", quizTitle = "";

  // Resolve ids from whatever the question carries, then WALK the hierarchy to
  // fill the gaps. This matters because a question's own `subject`/`session`
  // fields are not always populated — but the quiz ALWAYS stores subject +
  // session, and a session stores subject + topic. So a question that only has
  // `quiz` set can still resolve its FULL trail.
  //
  // (Previously the subject/stream were read ONLY from q.subject, so any
  // question missing that field — which happens for questions added through
  // several flows, not just plain MCQs — produced a broken, subject-less trail
  // and looked like the "drill-down" only worked for some questions.)
  let subjectId = q.subject || null;
  let sessionId = q.session || null;
  let topicId = null;

  if (q.quiz) {
    const qz = await Quiz.findById(q.quiz).select("subject session title").lean().catch(() => null);
    if (qz) {
      quizTitle = qz.title || "";
      if (!subjectId && qz.subject) subjectId = qz.subject;
      if (!sessionId && qz.session) sessionId = qz.session;
    }
  }
  if (sessionId) {
    const sess = await Session.findById(sessionId).select("subject topic").lean().catch(() => null);
    if (sess) {
      if (!subjectId && sess.subject) subjectId = sess.subject;
      if (sess.topic) topicId = sess.topic;
    }
  }
  if (topicId) {
    const t = await Topic.findById(topicId).select("title subject").lean().catch(() => null);
    if (t) {
      topicName = t.title || "";
      if (!subjectId && t.subject) subjectId = t.subject;
    }
  }
  if (subjectId) {
    const s = await Subject.findById(subjectId).select("name stream").lean().catch(() => null);
    if (s) {
      subjectName = s.name || "";
      if (s.stream) {
        const st = await Stream.findById(s.stream).select("name").lean().catch(() => null);
        streamName = st?.name || "";
      }
    }
  }

  // Fallbacks for questions NOT under a quiz (e.g. test-series questions, which
  // store a free-text topic/section and belong to a TestSeries instead): use
  // those so the trail is still meaningful rather than empty.
  if (!topicName && q.topic) topicName = q.topic;
  if (!quizTitle && q.testSeries) {
    const ts = await TestSeries.findById(q.testSeries).select("name").lean().catch(() => null);
    if (ts?.name) quizTitle = ts.name;
  }
  if (!topicName && q.section) topicName = q.section;

  return [streamName, subjectName, topicName, quizTitle].filter(Boolean).join(" › ");
}

// Build the Facebook post text for one question, honouring the schedule's
// formatting options (show options / reveal answer / hashtags).
export function formatQuestionPost(q, opts = {}) {
  const lines = [];
  // Drill-down trail (Stream › Subject › Topic › Quiz) as a small context line
  // at the very top, so viewers see where the question sits in the syllabus.
  if (opts.breadcrumb) { lines.push(opts.breadcrumb, ""); }
  if (q.text) lines.push(plain(q.text));

  // Matching / pair columns.
  if (Array.isArray(q.columnA) && q.columnA.length) {
    lines.push("");
    q.columnA.forEach((a, i) => lines.push(`${i + 1}. ${plain(a)}`));
    if (Array.isArray(q.columnB) && q.columnB.length) {
      lines.push("");
      q.columnB.forEach((b, i) => lines.push(`${ROMAN[i] || i + 1}. ${plain(b)}`));
    }
  }
  // Assertion & Reason.
  if (q.assertion) { lines.push("", `Assertion (A): ${plain(q.assertion)}`); if (q.reason) lines.push(`Reason (R): ${plain(q.reason)}`); }

  if (opts.includeOptions && Array.isArray(q.options) && q.options.length) {
    lines.push("");
    q.options.forEach((o, i) => lines.push(`${LETTERS[i]}) ${plain(o)}`));
  }

  if (opts.includeAnswer && Number.isInteger(q.correct)) {
    lines.push("", `✅ Answer: ${LETTERS[q.correct] || q.correct + 1}${Array.isArray(q.options) && q.options[q.correct] ? `) ${plain(q.options[q.correct])}` : ""}`);
    if (q.explanation) lines.push("", plain(q.explanation));
  } else if (opts.includeOptions) {
    lines.push("", "👉 Comment your answer below!");
  }

  if (opts.hashtags && String(opts.hashtags).trim()) lines.push("", String(opts.hashtags).trim());
  return lines.join("\n").slice(0, 60000); // FB text limit is generous; cap defensively
}

// Build the Mongo filter for a schedule's chosen content scope. Deepest wins.
function scopeFilter(source = {}) {
  const base = { status: "published" };
  if (source.quiz) return { ...base, quiz: source.quiz };
  if (source.session) return { ...base, session: source.session };
  if (source.testSeries) return { ...base, testSeries: source.testSeries };
  if (source.subject) return { ...base, subject: source.subject };
  return null;
}

// Pick the next question for a schedule (random or sequential), skipping ones
// already posted until the pool is exhausted, then cycling. Returns the doc.
export async function pickQuestionForSchedule(sch) {
  // A single specific question (scheduled straight from the question view).
  if (sch.source?.question) {
    const q = await Question.findById(sch.source.question).lean();
    return q ? { q, recycled: false } : null;
  }
  const filter = scopeFilter(sch.source);
  if (!filter) return null;
  const posted = (sch.postedQuestionIds || []).map(String);

  const poolSize = await Question.countDocuments(filter); // total questions in this source
  if (poolSize === 0) return null; // no questions at all in this scope

  const unusedFilter = posted.length ? { ...filter, _id: { $nin: sch.postedQuestionIds } } : filter;
  let count = posted.length ? await Question.countDocuments(unusedFilter) : poolSize;
  let useFilter = unusedFilter;
  let recycled = false;
  if (count === 0) {
    // Every question has been posted. Either STOP (default) or recycle the pool.
    if (sch.stopWhenExhausted !== false) return { exhausted: true, poolSize };
    count = poolSize;
    useFilter = filter;
    recycled = true;
  }

  let q;
  if (sch.order === "sequential") {
    q = await Question.findOne(useFilter).sort({ createdAt: 1 }).lean();
  } else {
    const skip = Math.floor(Math.random() * count);
    q = await Question.findOne(useFilter).skip(skip).lean();
  }
  return q ? { q, recycled, poolSize } : null;
}

// Short one-line excerpt of a question stem for notification emails.
function questionExcerpt(q, n = 120) {
  const s = String(q?.text || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Fire-and-forget email to the admin about a scheduler event (post / error /
// completion). Recipient = the configured FB notify email, else NOTIFY_EMAIL,
// else the first admin account. Never throws (must not break posting).
async function fbNotify({ site, subject, text, html }) {
  try {
    let to = String(site?.fbNotifyEmail || "").trim() || process.env.NOTIFY_EMAIL || "";
    if (!to) {
      const admin = await User.findOne({ role: "admin" }).select("email").lean().catch(() => null);
      to = admin?.email || "";
    }
    if (!to) return;
    const siteName = site?.siteName || "My Study Guide";
    await sendMail({
      to,
      subject,
      text,
      html: `${html}<p style="color:#94a3b8;font-size:12px;margin-top:16px">Automatic Facebook auto-post notification from ${siteName}.</p>`,
    }).catch(() => {});
  } catch { /* notifications must never break the scheduler */ }
}

// Time helpers ------------------------------------------------------------
function tzParts(date, timeZone) {
  try {
    const f = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || "Asia/Kolkata", hour12: false,
      weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    const hour = p.hour === "24" ? 0 : parseInt(p.hour, 10);
    return { dateStr: `${p.year}-${p.month}-${p.day}`, hh: hour, mm: parseInt(p.minute, 10), dow: WEEKDAYS.indexOf(p.weekday) };
  } catch {
    return { dateStr: date.toISOString().slice(0, 10), hh: date.getUTCHours(), mm: date.getUTCMinutes(), dow: date.getUTCDay() };
  }
}

// Return the slot key ("YYYY-MM-DD HH:MM") that is due to fire now, or null.
// A slot fires when the current time (in the schedule's timezone) is at/after
// it, within a grace window (so a brief downtime still posts, but stale slots
// from hours ago are skipped). lastSlot prevents re-firing the same slot.
const GRACE_MIN = 180;
function dueSlot(sch, now) {
  const { dateStr, hh, mm, dow } = tzParts(now, sch.timezone);
  if (Array.isArray(sch.days) && sch.days.length && !sch.days.includes(dow)) return null;
  const cur = hh * 60 + mm;
  let best = null;
  for (const t of sch.times || []) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
    if (!m) continue;
    const tmin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    if (cur >= tmin && cur - tmin <= GRACE_MIN) {
      const key = `${dateStr} ${String(m[1]).padStart(2, "0")}:${m[2]}`;
      if (!best || tmin > best.tmin) best = { key, tmin };
    }
  }
  if (best && sch.lastSlot !== best.key) return best.key;
  return null;
}

// Post a CUSTOM schedule (admin-written text + optional uploaded media) once, to
// Facebook and/or Instagram. Unlike a question schedule there's no pool/exhaust
// logic — a recurring custom schedule simply re-posts the same content at each
// slot. Returns { ok, error? } and mutates `sch` bookkeeping (caller saves it).
async function runCustomScheduleOnce(sch, cfg, site, schTitle, { notify = false } = {}) {
  const wantFb = sch.toFacebook !== false;
  const wantIg = !!sch.toInstagram && cfg.igEnabled;
  if (!wantFb && !wantIg) return { ok: false, error: "No destination selected (enable Facebook and/or Instagram)." };

  // Build the message: the admin's text, plus any trailing hashtags on the schedule.
  const text = String(sch.customText || "").trim();
  const tags = String(sch.hashtags || "").trim();
  const message = [text, tags].filter(Boolean).join("\n\n").slice(0, 5000);
  const media = (Array.isArray(sch.customMedia) ? sch.customMedia : []).map((u) => String(u || "").trim()).filter(Boolean);
  const rawImageUrl = media[0] || "";

  if (!message && !rawImageUrl) {
    sch.lastRunAt = new Date();
    sch.lastResult = "Failed: a custom post needs text or an image.";
    return { ok: false, error: "A custom post needs text or an image." };
  }

  const notes = [];
  let anyOk = false;

  if (wantFb) {
    // Pad an ultra-wide image to Facebook's limit so it isn't side-cropped.
    const fbImageUrl = rawImageUrl ? toFacebookSafeUrl(rawImageUrl) : undefined;
    const r = await postToFacebookPage({ message, imageUrl: fbImageUrl }, cfg);
    if (r.ok) { anyOk = true; notes.push("Facebook ✓"); } else notes.push(`Facebook ✗ (${r.error})`);

    for (const t of site?.fbExtraTargets || []) {
      const pageId = String(t?.pageId || "").trim();
      const token = String(t?.token || "").trim();
      if (!pageId || !token) continue;
      const rr = await postToFacebookPage({ message, imageUrl: fbImageUrl }, { ...cfg, pageId, token });
      const name = t.label || pageId;
      if (rr.ok) { anyOk = true; notes.push(`${name} ✓`); } else notes.push(`${name} ✗ (${rr.error})`);
    }
  }
  if (wantIg) {
    if (!rawImageUrl) notes.push("Instagram ✗ (a custom Instagram post needs an image)");
    else {
      const igImageUrl = toInstagramSafeUrl(rawImageUrl);
      const r = await postToInstagram({ imageUrl: igImageUrl, caption: message }, cfg);
      if (r.ok) { anyOk = true; notes.push("Instagram ✓"); } else notes.push(`Instagram ✗ (${r.error})`);
    }
  }

  sch.lastRunAt = new Date();
  if (anyOk) {
    sch.postCount = (sch.postCount || 0) + 1;
    sch.lastResult = notes.join(" · ");
    if (notify && site?.fbNotifyOnPost === true) {
      await fbNotify({
        site,
        subject: `📢 Auto-posted — ${schTitle}`,
        text: `Posted a custom update to ${notes.join(", ")}.${text ? `\n${text.slice(0, 160)}` : ""}`,
        html: `<p>📢 <b>${schTitle}</b> posted a custom update.</p><p><b>Destinations:</b> ${notes.join(" · ")}</p>${text ? `<p>${String(text.slice(0, 300)).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : ""}`,
      });
    }
    return { ok: true, notes };
  }
  sch.lastResult = `Failed: ${notes.join(" · ")}`;
  if (notify && site?.fbNotifyOnError !== false) {
    await fbNotify({
      site,
      subject: `⚠️ Auto-post failed — ${schTitle}`,
      text: `Could not post the custom update. ${notes.join(" · ")}`,
      html: `<p>⚠️ <b>${schTitle}</b> failed to post.</p><p>${notes.join(" · ")}</p>`,
    });
  }
  return { ok: false, error: notes.join(" · ") || "Failed to post." };
}

// Post one question from a schedule right now (used by the scheduler AND the
// admin "Post now" button). Posts to Facebook and/or Instagram, as an image
// card when requested (Instagram always needs one). Returns { ok, error? }.
export async function runScheduleOnce(sch, cfgOverride, { notify = false } = {}) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook is not connected." };
  // Load site settings up-front — used for hashtags, watermarks AND the
  // notification preferences/recipient below.
  const site = await Settings.findOne({ key: "site" }).lean().catch(() => null);
  const schTitle = sch.title || sch.source?.label || "Untitled schedule";

  // Custom post (admin-written text + uploaded media) — not a quiz question.
  if (sch.kind === "custom") return runCustomScheduleOnce(sch, cfg, site, schTitle, { notify });

  const picked = await pickQuestionForSchedule(sch);
  // Source fully posted → STOP this schedule (unless it's set to recycle).
  if (picked?.exhausted) {
    sch.enabled = false;
    sch.completedAt = new Date();
    sch.poolSize = picked.poolSize || sch.poolSize || 0;
    sch.lastRunAt = new Date();
    sch.lastResult = `Completed — all ${picked.poolSize} question(s) in this source have been posted. Schedule paused.`;
    if (notify && site?.fbNotifyOnComplete !== false) {
      await fbNotify({
        site,
        subject: `✅ Auto-post complete — ${schTitle}`,
        text: `All ${picked.poolSize} question(s) from "${sch.source?.label || schTitle}" have been posted. The schedule was paused automatically so nothing repeats.`,
        html: `<p>✅ <b>${schTitle}</b> has finished.</p><p>All <b>${picked.poolSize}</b> question(s) from <b>${sch.source?.label || "the selected source"}</b> have been posted. The schedule was paused automatically so no questions repeat.</p>`,
      });
    }
    return { ok: false, exhausted: true, completed: true, error: "All questions in this source have been posted." };
  }
  if (!picked || !picked.q) return { ok: false, error: "No published questions found in the selected source." };
  const { q, recycled, poolSize } = picked;

  const wantFb = sch.toFacebook !== false;
  const wantIg = !!sch.toInstagram && cfg.igEnabled;
  // Global default + auto hashtags (from the question's subject/topic/section)
  // merged with any per-post tags — so every post is tagged consistently.
  const finalTags = await hashtagsForQuestion(q, site, sch.hashtags);
  const breadcrumb = await breadcrumbForQuestion(q);
  const message = formatQuestionPost(q, {
    includeOptions: sch.includeOptions,
    includeAnswer: sch.includeAnswer,
    hashtags: finalTags,
    breadcrumb,
  });
  const link = sch.includeLink && cfg.siteUrl ? cfg.siteUrl : undefined;

  // Render an image if a photo post is requested, or if Instagram is a target
  // (IG can't post text-only). Falls back to text if rendering fails.
  // Also render an image when the selfie watermark is enabled — this ensures the
  // admin's selfie branding appears on EVERY post (text + image).
  const selfieWatermarkActive = site?.fbSelfieWatermarkEnabled !== false && !!site?.fbSelfieWatermarkUrl;
  // Center text watermark — resolve its text now (falls back to the site
  // watermark text, then the site name) so we can tell whether it's active.
  const textWatermarkText = String(
    site?.fbTextWatermarkText || site?.watermarkText || site?.siteName || ""
  ).trim();
  const textWatermarkActive = site?.fbTextWatermarkEnabled === true && !!textWatermarkText;
  let imageUrl = null, imageErr = "";
  if (sch.asImage || wantIg || selfieWatermarkActive || textWatermarkActive) {
    // PREFER a pixel-identical screenshot of the REAL quiz card (matches the
    // admin Download button exactly — same React/Tailwind/Inter). Best-effort:
    // any failure falls through to the lightweight SVG card so posting never
    // breaks.
    try {
      const shot = await renderQuestionCardShot(q, {
        includeAnswer: sch.includeAnswer,
        // Ask viewers to comment when we are NOT revealing the answer.
        cta: !sch.includeAnswer,
        // Bake the selfie/logo watermark into the card when it's enabled.
        watermark: selfieWatermarkActive
          ? {
              url: site.fbSelfieWatermarkUrl,
              size: site.fbSelfieWatermarkSize || 120,
              opacity: site.fbSelfieWatermarkOpacity || 90,
              position: site.fbSelfieWatermarkPosition || "bottom-right",
              shape: site.fbSelfieWatermarkShape || "circle",
            }
          : null,
        // Bake the diagonal center text watermark into the card when enabled.
        textWatermark: textWatermarkActive
          ? {
              text: textWatermarkText,
              size: site.fbTextWatermarkSize || 64,
              opacity: site.fbTextWatermarkOpacity || 12,
            }
          : null,
      });
      if (shot?.url) imageUrl = shot.url;
      else imageErr = shot?.error || "";
    } catch (e) {
      imageErr = e?.message || String(e);
    }
    if (!imageUrl) {
      if (sch.imageUrl && !selfieWatermarkActive) {
        // A screenshot captured in the admin's browser — used only when no
        // watermark is active (watermark requires server-side rendering).
        imageUrl = sch.imageUrl;
      } else {
        // Server-rendered SVG card (fallback) — includes the watermark overlay.
        const r = await renderQuestionImage(q, {
          includeOptions: sch.includeOptions,
          includeAnswer: sch.includeAnswer,
          hashtags: finalTags,
        });
        imageUrl = r.url || null;
        imageErr = imageErr || r.error || "";
      }
    }
  }

  const notes = [];
  let anyOk = false;

  if (wantFb) {
    // Always attach the image when a selfie watermark is active (ensures branding on every post).
    // A very SHORT/WIDE card (e.g. a plain MCQ) can exceed Facebook's widest
    // supported ratio (1.91:1) and get its sides cropped in the feed, cutting off
    // the option letters / start of each line. Pad only such a card DOWN to
    // 1.91:1 (a tiny white sliver, NOT a tall canvas) so Facebook shows it in
    // full. Cards already within range are left untouched. See
    // utils/facebookImage.js.
    const fbRawImageUrl = (sch.asImage || selfieWatermarkActive) ? imageUrl : undefined;
    const fbImageUrl = fbRawImageUrl ? toFacebookSafeUrl(fbRawImageUrl) : undefined;
    const r = await postToFacebookPage({ message, link, imageUrl: fbImageUrl }, cfg);
    if (r.ok) { anyOk = true; notes.push("Facebook ✓"); } else notes.push(`Facebook ✗ (${r.error})`);

    // Cross-post to any extra Facebook Pages the admin added (each with its own
    // token). Groups are NOT supported by the Facebook API, so only Pages work.
    for (const t of site?.fbExtraTargets || []) {
      const pageId = String(t?.pageId || "").trim();
      const token = String(t?.token || "").trim();
      if (!pageId || !token) continue;
      const rr = await postToFacebookPage(
        { message, link, imageUrl: fbImageUrl },
        { ...cfg, pageId, token }
      );
      const name = t.label || pageId;
      if (rr.ok) { anyOk = true; notes.push(`${name} ✓`); } else notes.push(`${name} ✗ (${rr.error})`);
    }
  }
  if (wantIg) {
    if (!imageUrl) notes.push(`Instagram ✗ (image failed${imageErr ? `: ${imageErr}` : ""})`);
    else {
      // Question cards render at a VARIABLE height, so a tall card falls below
      // Instagram's minimum 4:5 aspect ratio and the API rejects it ("The aspect
      // ratio is not supported."). Pad the (Cloudinary-hosted) image onto a 4:5
      // canvas for Instagram only — Facebook already got the untouched image and
      // accepts any ratio. Padding never crops, so the full card stays visible.
      const igImageUrl = toInstagramSafeUrl(imageUrl);
      const r = await postToInstagram({ imageUrl: igImageUrl, caption: message }, cfg);
      if (r.ok) { anyOk = true; notes.push("Instagram ✓"); } else notes.push(`Instagram ✗ (${r.error})`);
    }
  }
  if (!wantFb && !wantIg) return { ok: false, error: "No destination selected (enable Facebook and/or Instagram)." };

  sch.lastRunAt = new Date();
  if (poolSize) sch.poolSize = poolSize;
  if (anyOk) {
    sch.postedQuestionIds = recycled ? [q._id] : [...(sch.postedQuestionIds || []), q._id];
    sch.postCount = (sch.postCount || 0) + 1;
    sch.lastResult = `${notes.join(" · ")}${recycled ? " (restarted the pool)" : ""}`;
    if (notify && site?.fbNotifyOnPost === true) {
      const postedCount = (sch.postedQuestionIds || []).length;
      const prog = poolSize ? `\nProgress: ${postedCount} of ${poolSize} posted.` : "";
      await fbNotify({
        site,
        subject: `📢 Auto-posted — ${schTitle}`,
        text: `Posted to ${notes.join(", ")}.\nQuestion: ${questionExcerpt(q)}${prog}`,
        html: `<p>📢 <b>${schTitle}</b> posted a question.</p><p><b>Destinations:</b> ${notes.join(" · ")}</p><p><b>Question:</b> ${questionExcerpt(q)}</p>${poolSize ? `<p><b>Progress:</b> ${postedCount} of ${poolSize} posted.</p>` : ""}`,
      });
    }
  } else {
    sch.lastResult = `Failed: ${notes.join(" · ")}`;
    if (notify && site?.fbNotifyOnError !== false) {
      await fbNotify({
        site,
        subject: `⚠️ Auto-post FAILED — ${schTitle}`,
        text: `A scheduled Facebook/Instagram post failed.\nSchedule: ${schTitle}\nSource: ${sch.source?.label || "—"}\nError: ${notes.join(" · ")}`,
        html: `<p>⚠️ A scheduled post <b>failed</b>.</p><p><b>Schedule:</b> ${schTitle}<br/><b>Source:</b> ${sch.source?.label || "—"}</p><p><b>Details:</b> ${notes.join(" · ")}</p>`,
      });
    }
  }
  return { ok: anyOk, error: anyOk ? undefined : notes.join(" · "), id: undefined };
}

// The scheduler tick — called every minute (server interval) and, as a
// safety net, from the throttled /api/health ping. Guarded so overlapping
// calls can't double-post.
// Non-sensitive scheduler heartbeat so the auto-poster can be diagnosed from
// /api/health WITHOUT server/SSH access. Contains NO tokens or page ids — only
// counts and timestamps. `lastTickAt` updating every ~minute proves the timer
// runs; `configured=0` while `tenants>0` means the FB config lookup for the
// schedule's tenant failed (the silent-bail case); `enabled>0 && due=0` means
// the time-matching found nothing.
export const fbSchedulerStatus = {
  lastTickAt: null,
  tenants: 0,        // tenants that have enabled schedules
  configured: 0,     // of those, how many had FB connected + enabled
  enabled: 0,        // total enabled schedules seen
  due: 0,            // schedules whose time was due last tick
  posted: 0,         // successful auto-posts last tick
  lastError: "",     // last non-sensitive error, if any
  // Diagnostic-only (tenant ObjectIds, not secrets) — reveals the exact
  // storage mismatch: which tenant the schedules are under vs. which tenant the
  // configured FB "site" settings are under, plus the resolved default tenant.
  scheduleTenants: [],
  defaultTenantId: null,
  configuredSiteTenants: [],
};

let fbTickStartedAt = 0;
const FB_TICK_MAX_MS = 4 * 60 * 1000; // a tick can't legitimately run this long
export async function runDueFbSchedules() {
  // Skip only while a tick is GENUINELY still in flight (started recently). If a
  // previous tick has been "running" longer than the max, it must have hung —
  // so self-heal by starting a fresh one instead of staying stuck forever (the
  // old boolean guard could latch on a hung network call and silently kill ALL
  // timed posts until the next server restart).
  if (fbTickStartedAt && Date.now() - fbTickStartedAt < FB_TICK_MAX_MS) return;
  fbTickStartedAt = Date.now();
  const stats = { tenants: 0, configured: 0, enabled: 0, due: 0, posted: 0, lastError: "", scheduleTenants: [], defaultTenantId: null, configuredSiteTenants: [] };
  try {
    // Every institute posts to its OWN Facebook page. Find each tenant that has
    // enabled schedules, then process each inside its own context using its own
    // credentials — so a post can never go to the wrong institute's page.
    // (distinct is not tenant-scoped by the plugin, so it sees every tenant.)
    // "" represents the platform/default space (tenantId null/absent).
    const rawTids = await FbSchedule.distinct("tenantId", { enabled: true });
    const keys = [...new Set(rawTids.map((t) => (t ? String(t) : "")))];
    stats.tenants = keys.length;
    // Diagnostic: capture the actual tenant ids so the storage mismatch is
    // visible from /api/health (schedules' tenant vs. where FB config lives).
    stats.scheduleTenants = rawTids.map((t) => (t == null ? "null" : String(t)));
    try {
      const defId = await getDefaultTenantId();
      stats.defaultTenantId = defId == null ? "null" : String(defId);
      const sites = await runUnscoped(() => Settings.find({ key: "site", fbEnabled: true }).select("tenantId").lean());
      stats.configuredSiteTenants = sites.map((s) => (s.tenantId == null ? "null" : String(s.tenantId)));
    } catch { /* diagnostic only — never affects posting */ }
    for (const key of keys) {
      const tid = key === "" ? null : key;
      await tenantStore.run({ tenantId: tid, bypass: !tid }, () => runTenantSchedules(tid, stats).catch((e) => { stats.lastError = e?.message || String(e); }));
    }
  } catch (e) {
    stats.lastError = e?.message || String(e);
  } finally {
    fbTickStartedAt = 0;
    fbSchedulerStatus.lastTickAt = new Date().toISOString();
    fbSchedulerStatus.tenants = stats.tenants;
    fbSchedulerStatus.configured = stats.configured;
    fbSchedulerStatus.enabled = stats.enabled;
    fbSchedulerStatus.due = stats.due;
    fbSchedulerStatus.posted = stats.posted;
    fbSchedulerStatus.lastError = stats.lastError;
    fbSchedulerStatus.scheduleTenants = stats.scheduleTenants;
    fbSchedulerStatus.defaultTenantId = stats.defaultTenantId;
    fbSchedulerStatus.configuredSiteTenants = stats.configuredSiteTenants;
  }
}

// Fire all due schedules for ONE tenant using THAT tenant's own credentials.
async function runTenantSchedules(tid, stats = null) {
  let cfg = await getFacebookConfig({ tenantId: tid ?? null });
  if (!cfg.enabled || !isFacebookConfigured(cfg)) {
    // The PLATFORM's schedules can be stamped with the default-tenant id while
    // its Facebook settings ("site" doc) live under tenantId null — or vice
    // versa (a tenant-backfill mismatch). An exact tenantId match then finds no
    // config and the scheduler silently bails (the real bug: manual posting,
    // which looks up settings unscoped, still worked). For the platform space
    // ONLY, resolve the settings across BOTH null and the default id, unscoped,
    // so the connection is found regardless of which id it was saved under.
    // Real institute tenants keep STRICT isolation (no fallback to the platform
    // page) — an institute with no own connection simply doesn't post.
    const defId = await getDefaultTenantId();
    const isPlatform = tid == null || (defId && String(tid) === String(defId));
    if (isPlatform) {
      // Select the CONFIGURED platform site doc (fbEnabled). An empty
      // placeholder "site" doc can exist under the OTHER platform id (e.g. a
      // blank one under null while the real connection is under the default
      // tenant), and a plain findOne could return that unconfigured doc — so
      // require fbEnabled to land on the doc that actually holds the connection.
      cfg = await runUnscoped(() =>
        getFacebookConfig({ fbEnabled: true, tenantId: { $in: defId ? [null, defId] : [null] } })
      );
    }
  }
  if (!cfg.enabled || !isFacebookConfigured(cfg)) return; // this institute's posting is off / not connected
  if (stats) stats.configured += 1;
  const now = new Date();
  const schedules = await FbSchedule.find({ enabled: true, tenantId: tid ?? null });
  if (stats) stats.enabled += schedules.length;
  for (const sch of schedules) {
    let slot = null;
    if (sch.mode === "once") {
      // One-off: fire once when its time has arrived and it hasn't run yet.
      if (sch.runAt && new Date(sch.runAt).getTime() <= now.getTime() && !sch.lastSlot) slot = "once";
    } else {
      slot = dueSlot(sch, now);
    }
    if (!slot) continue;
    if (stats) stats.due += 1;
    // Claim the slot FIRST (persist) so a concurrent tick won't repost it,
    // then post. If the post fails, lastResult records why.
    sch.lastSlot = slot === "once" ? "done" : slot;
    if (sch.mode === "once") sch.enabled = false; // one-off never repeats
    await sch.save();
    try {
      const r = await runScheduleOnce(sch, cfg, { notify: true });
      if (stats && r?.ok) stats.posted += 1;
      else if (stats && r && !r.ok && !r.exhausted) stats.lastError = r.error || "post failed";
      // A ONE-TIME post disappears once it has published SUCCESSFULLY — delete
      // the schedule so it's gone from the list. A failed one is kept (with its
      // error) so the admin can see it and retry.
      if (sch.mode === "once" && r?.ok) await FbSchedule.deleteOne({ _id: sch._id });
      else await sch.save();
    } catch (e) {
      sch.lastResult = `Error: ${e.message}`;
      if (stats) stats.lastError = e.message;
      await sch.save().catch(() => {});
    }
  }
}
