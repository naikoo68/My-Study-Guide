// Facebook / Instagram Graph API helper — verifies page credentials and publishes
// auto-posts to a connected Facebook page / Instagram account.

import Settings from "../models/Settings.js";
import User from "../models/User.js";
import { sendMail } from "./mailer.js";
import { toInstagramSafeUrl, toInstagramStoryUrl } from "../utils/instagramImage.js";
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

// A Facebook Page Reel uploaded from a hosted file_url is DOWNLOADED by
// Facebook asynchronously. Calling the finish/publish step before that download
// completes leaves the Reel unpublished — it never appears on the Page (while
// Instagram, which we poll, works). Poll the video's status until Facebook has
// finished fetching the file (uploading phase complete / video ready) before we
// publish. Best-effort: on a terminal error or timeout returns { ok:false } and
// the caller falls back to a normal /videos post.
async function waitForFbReelReady(cfg, videoId, token, { tries = 40, delayMs = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    let data = {};
    try {
      const res = await fbFetch(
        `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(videoId)}?fields=status&access_token=${encodeURIComponent(token)}`
      );
      data = await res.json().catch(() => ({}));
    } catch {
      /* transient network hiccup — retry */
    }
    const st = data?.status || {};
    const up = st.uploading_phase?.status;   // in_progress | complete | error
    const vs = st.video_status;              // ready | processing | ...
    if (up === "complete" || vs === "ready" || vs === "upload_complete") return { ok: true };
    if (up === "error" || vs === "error" || st.processing_phase?.status === "error") {
      return { ok: false, error: st.uploading_phase?.error?.message || st.processing_phase?.error?.message || "Facebook could not fetch/process the Reel video." };
    }
    await sleep(delayMs);
  }
  return { ok: false, error: "Facebook did not finish fetching the Reel video in time." };
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

// A publish that returns a real PAGE POST id (not a bare photo id) makes
// Facebook classify the content like a manually-created post, so the Page's
// native "Posts" counter (and the published_posts/posts edges) treat it the
// same way. See FACEBOOK_COUNT_ARCHITECTURE.md.

// Low-level form POST to the Graph API. Returns { ok, status, data }.
async function fbGraphPost(url, params, pageToken) {
  const body = new URLSearchParams(params);
  body.set("access_token", pageToken);
  const res = await fbFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Turn a raw Graph error into a friendlier one for the common "wrong token" case.
function decorateFbError(error, status) {
  let e = error || `Facebook API error${status ? ` (${status})` : ""}.`;
  if (/publish_actions|\(#200\)/i.test(e)) {
    e = "Facebook rejected the token. Use a PAGE access token (not a User token) with the pages_manage_posts permission, then save again. " + e;
  }
  return { ok: false, error: e };
}

// PREFERRED image publish — two steps so the result is a REAL Page feed post
// (exactly like a manual "Create post" with a photo), which increments the
// native Page post counter:
//   1) upload the photo UNPUBLISHED (published=false) → a media_fbid, no story
//   2) create a /feed post that ATTACHES that media → a real {page}_{post} id
// Returns { ok, id?, error? }.
async function postImageAsFeedPost(cfg, { message, imageUrl }, pageToken) {
  const base = `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}`;

  // Step 1 — upload the photo without publishing a photo story.
  const up = await fbGraphPost(`${base}/photos`, { url: imageUrl, published: "false" }, pageToken);
  const mediaId = up.data?.id;
  if (!up.ok || !mediaId) {
    return { ok: false, error: up.data?.error?.message || `Photo upload failed (${up.status}).` };
  }

  // Step 2 — publish a normal feed post that attaches the uploaded photo.
  const params = { "attached_media[0]": JSON.stringify({ media_fbid: String(mediaId) }) };
  if (message) params.message = message;
  const post = await fbGraphPost(`${base}/feed`, params, pageToken);
  const postId = post.data?.id || post.data?.post_id;
  if (post.ok && postId) return { ok: true, id: postId };
  return { ok: false, error: post.data?.error?.message || `Feed post failed (${post.status}).` };
}

// LEGACY image publish (kept as a fallback only). Single call to /photos, which
// creates a photo-story object — visible, but NOT counted like a feed post.
async function postImageDirect(cfg, { message, imageUrl }, pageToken) {
  const url = `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}/photos`;
  const params = { url: imageUrl };
  if (message) params.caption = message;
  const r = await fbGraphPost(url, params, pageToken);
  const id = r.data?.post_id || r.data?.id;
  if (r.ok && id) return { ok: true, id };
  return { ok: false, error: r.data?.error?.message || `Facebook API error (${r.status}).` };
}

export async function postToFacebookPage({ message, link, imageUrl } = {}, cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook Page ID or access token is not set." };

  const msg = String(message || "").trim();
  const lnk = String(link || "").trim();
  const img = String(imageUrl || "").trim();
  if (!msg && !lnk && !img) return { ok: false, error: "Nothing to post (empty message)." };

  const pageToken = await resolvePageToken(cfg); // ensure a PAGE token (not a user token)

  try {
    if (img) {
      // Publish images as a real feed post so Facebook counts them like a
      // manual post. If that fails for ANY reason, fall back to the legacy
      // single-step photo publish so posting reliability is never reduced.
      const primary = await postImageAsFeedPost(cfg, { message: msg, imageUrl: img }, pageToken);
      if (primary.ok) return primary;
      const fallback = await postImageDirect(cfg, { message: msg, imageUrl: img }, pageToken);
      if (fallback.ok) return fallback;
      return decorateFbError(primary.error || fallback.error);
    }

    // No image → a normal feed post (optionally with a link), unchanged.
    const params = {};
    if (msg) params.message = msg;
    if (lnk) params.link = lnk;
    const r = await fbGraphPost(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}/feed`, params, pageToken);
    const id = r.data?.post_id || r.data?.id;
    if (r.ok && id) return { ok: true, id };
    return decorateFbError(r.data?.error?.message, r.status);
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Facebook." };
  }
}

// Resolve the Instagram Business account id linked to the Facebook Page. Uses
// the configured igUserId if set, else auto-detects it from the Page.
// CACHED (like the Page token): a single scheduled run publishes a feed post,
// a Reel and/or a Story — each of which needs the IG account id. Re-fetching it
// every time burns extra Graph calls and helps trip Meta's app rate limit
// ("Application request limit reached"), which then fails a post that would
// otherwise succeed. Caching resolves it once per Page/token for a few minutes.
const _igUserIdCache = new Map();
export async function getInstagramUserId(cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (cfg.igUserId) return cfg.igUserId;
  if (!isFacebookConfigured(cfg)) return null;
  const key = `${cfg.pageId}:${String(cfg.token).slice(0, 16)}`;
  const hit = _igUserIdCache.get(key);
  if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.id;
  try {
    const res = await fbFetch(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}?fields=instagram_business_account&access_token=${encodeURIComponent(cfg.token)}`);
    const data = await res.json().catch(() => ({}));
    const id = data?.instagram_business_account?.id || null;
    if (id) _igUserIdCache.set(key, { id, ts: Date.now() });
    return id;
  } catch {
    return null;
  }
}

// Whether an Instagram publish error is TRANSIENT and worth retrying: the media
// container is already created and valid, so re-issuing media_publish after a
// short wait usually succeeds. Covers the brief post-processing propagation lag
// ("Media ID is not available") AND Meta's app-level rate limit ("Application
// request limit reached", errors #4/#17/#32) — the latter is exactly what made a
// feed post fail while the Story, published a few seconds later, went through.
function isRetryableIgPublishError(msg) {
  return /not available|not ready|request limit|rate limit|reduce the amount|temporarily|#4\b|#17\b|#32\b/i.test(String(msg || ""));
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
    for (let attempt = 0; attempt < 5; attempt++) {
      const pRes = await fbFetch(`https://graph.facebook.com/${cfg.version}/${igId}/media_publish`, { method: "POST", headers, body: p });
      pData = await pRes.json().catch(() => ({}));
      if (pRes.ok && pData.id) return { ok: true, id: pData.id };
      const msg = String(pData?.error?.message || "");
      // Only retry the transient "not available/ready" case; bail on real errors.
      if (!isRetryableIgPublishError(msg)) break;
      // Back off longer for a rate limit than for the brief propagation lag —
      // a few seconds is usually enough for the limit window to free up.
      await sleep(/request limit|rate limit|#4\b|#17\b|#32\b/i.test(msg) ? 5000 : 2000);
    }
    return { ok: false, error: pData?.error?.message || `Instagram publish error.` };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Instagram." };
  }
}

// Post a REEL (short vertical video) to Instagram from a PUBLIC video URL
// (create container with media_type=REELS → wait for processing → publish).
// Video is processed asynchronously by Instagram, so we poll longer than an
// image. Returns { ok, id?, error? }. Never throws.
export async function postReelToInstagram({ videoUrl, caption } = {}, cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook/Instagram is not connected." };
  const vid = String(videoUrl || "").trim();
  if (!vid) return { ok: false, error: "Instagram needs a video to post a Reel." };
  const igId = await getInstagramUserId(cfg);
  if (!igId) return { ok: false, error: "No Instagram Business account is linked to this Facebook Page." };
  const pageToken = await resolvePageToken(cfg); // IG publishing uses the Page token

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  try {
    // 1) Create a REELS media container pointing at the hosted video.
    const c = new URLSearchParams();
    c.set("media_type", "REELS");
    c.set("video_url", vid);
    if (caption) c.set("caption", String(caption).slice(0, 2100));
    c.set("access_token", pageToken);
    const cRes = await fbFetch(`https://graph.facebook.com/${cfg.version}/${igId}/media`, { method: "POST", headers, body: c });
    const cData = await cRes.json().catch(() => ({}));
    if (!cRes.ok || !cData.id) return { ok: false, error: cData?.error?.message || `Instagram Reel container error (${cRes.status}).` };

    // 2) Wait for Instagram to finish DOWNLOADING + TRANSCODING the video before
    // publishing. Video takes far longer than an image, so poll longer (~3 min).
    const ready = await waitForIgContainerReady(cfg, cData.id, pageToken, { tries: 40, delayMs: 5000 });
    if (!ready.ok) return { ok: false, error: ready.error };

    // 3) Publish the container. Retry the brief "not available" propagation lag.
    const p = new URLSearchParams();
    p.set("creation_id", cData.id);
    p.set("access_token", pageToken);
    let pData = {};
    for (let attempt = 0; attempt < 5; attempt++) {
      const pRes = await fbFetch(`https://graph.facebook.com/${cfg.version}/${igId}/media_publish`, { method: "POST", headers, body: p });
      pData = await pRes.json().catch(() => ({}));
      if (pRes.ok && pData.id) return { ok: true, id: pData.id };
      const msg = String(pData?.error?.message || "");
      if (!isRetryableIgPublishError(msg)) break;
      await sleep(/request limit|rate limit|#4\b|#17\b|#32\b/i.test(msg) ? 5000 : 3000);
    }
    return { ok: false, error: pData?.error?.message || "Instagram Reel publish error." };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Instagram." };
  }
}

// Post a REEL (short vertical video) to a Facebook Page from a PUBLIC video URL.
// Facebook Reels use the dedicated /video_reels resumable-upload flow, in three
// phases:
//   1) start  — reserve a video_id + an upload URL
//   2) upload — tell Facebook to fetch the hosted file (file_url header)
//   3) finish — publish the reel (video_state=PUBLISHED) with the description
// If /video_reels fails for ANY reason, fall back to a normal /videos post from
// the same hosted URL so a video still goes out. Returns { ok, id?, error? }.
export async function postReelToFacebookPage({ videoUrl, description } = {}, cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook Page ID or access token is not set." };
  const vid = String(videoUrl || "").trim();
  if (!vid) return { ok: false, error: "Facebook needs a video to post a Reel." };
  const desc = String(description || "").trim();
  const pageToken = await resolvePageToken(cfg);
  const base = `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}`;

  const reel = await (async () => {
    try {
      // Phase 1 — start: get a video_id + upload_url.
      const start = await fbGraphPost(`${base}/video_reels`, { upload_phase: "start" }, pageToken);
      const videoId = start.data?.video_id;
      const uploadUrl = start.data?.upload_url;
      if (!start.ok || !videoId || !uploadUrl) {
        return { ok: false, error: start.data?.error?.message || `Reel start failed (${start.status}).` };
      }

      // Phase 2 — upload: ask Facebook to fetch the hosted file. The rupload
      // host takes the Page token as an OAuth header and the source as file_url.
      const upRes = await fbFetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `OAuth ${pageToken}`, file_url: vid },
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok || upData?.success === false) {
        return { ok: false, error: upData?.error?.message || `Reel upload failed (${upRes.status}).` };
      }

      // Facebook downloads the hosted file ASYNCHRONOUSLY. Wait until that's
      // done before finishing, or the published Reel never appears on the Page.
      const ready = await waitForFbReelReady(cfg, videoId, pageToken);
      if (!ready.ok) return { ok: false, error: ready.error };

      // Phase 3 — finish: publish the reel.
      const finishParams = { video_id: String(videoId), upload_phase: "finish", video_state: "PUBLISHED" };
      if (desc) finishParams.description = desc;
      const fin = await fbGraphPost(`${base}/video_reels`, finishParams, pageToken);
      if (fin.ok && (fin.data?.success === true || fin.data?.id)) {
        // Reel processes asynchronously; the video_id is its stable reference.
        return { ok: true, id: String(fin.data?.id || videoId) };
      }
      return { ok: false, error: fin.data?.error?.message || `Reel finish failed (${fin.status}).` };
    } catch (err) {
      return { ok: false, error: err.message || "Could not reach Facebook." };
    }
  })();
  if (reel.ok) return reel;

  // Fallback — a normal Page video post from the hosted URL (still a video, just
  // not classified as a Reel), so posting reliability is never reduced.
  try {
    const params = { file_url: vid };
    if (desc) params.description = desc;
    const r = await fbGraphPost(`${base}/videos`, params, pageToken);
    const id = r.data?.id;
    if (r.ok && id) return { ok: true, id: String(id) };
    return decorateFbError(r.data?.error?.message || reel.error, r.status);
  } catch (err) {
    return { ok: false, error: reel.error || err.message || "Could not reach Facebook." };
  }
}

// Post an image as an Instagram STORY (24h, full-screen) from a PUBLIC image URL
// (create a media_type=STORIES container → wait for processing → publish).
// Stories carry no caption/hashtags. Returns { ok, id?, error? }. Never throws.
export async function postStoryToInstagram({ imageUrl } = {}, cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook/Instagram is not connected." };
  // Pad the card onto a 9:16 story canvas so Instagram can't crop off the sides
  // (a feed-shaped card filled into the full-screen story loses its edges).
  const img = toInstagramStoryUrl(String(imageUrl || "").trim());
  if (!img) return { ok: false, error: "Instagram needs an image to post a Story." };
  const igId = await getInstagramUserId(cfg);
  if (!igId) return { ok: false, error: "No Instagram Business account is linked to this Facebook Page." };
  const pageToken = await resolvePageToken(cfg);

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  try {
    // 1) Create a STORIES media container pointing at the hosted image.
    const c = new URLSearchParams();
    c.set("media_type", "STORIES");
    c.set("image_url", img);
    c.set("access_token", pageToken);
    const cRes = await fbFetch(`https://graph.facebook.com/${cfg.version}/${igId}/media`, { method: "POST", headers, body: c });
    const cData = await cRes.json().catch(() => ({}));
    if (!cRes.ok || !cData.id) return { ok: false, error: cData?.error?.message || `Instagram Story container error (${cRes.status}).` };

    // 2) Wait for the container to finish processing before publishing.
    const ready = await waitForIgContainerReady(cfg, cData.id, pageToken);
    if (!ready.ok) return { ok: false, error: ready.error };

    // 3) Publish. Retry the brief "not available" propagation lag.
    const p = new URLSearchParams();
    p.set("creation_id", cData.id);
    p.set("access_token", pageToken);
    let pData = {};
    for (let attempt = 0; attempt < 5; attempt++) {
      const pRes = await fbFetch(`https://graph.facebook.com/${cfg.version}/${igId}/media_publish`, { method: "POST", headers, body: p });
      pData = await pRes.json().catch(() => ({}));
      if (pRes.ok && pData.id) return { ok: true, id: pData.id };
      const msg = String(pData?.error?.message || "");
      if (!isRetryableIgPublishError(msg)) break;
      // Back off longer for a rate limit than for the brief propagation lag —
      // a few seconds is usually enough for the limit window to free up.
      await sleep(/request limit|rate limit|#4\b|#17\b|#32\b/i.test(msg) ? 5000 : 2000);
    }
    return { ok: false, error: pData?.error?.message || "Instagram Story publish error." };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Instagram." };
  }
}

// Post an image as a Facebook Page STORY from a PUBLIC image URL. Two steps:
//   1) upload the photo UNPUBLISHED (published=false) → a photo_id
//   2) POST /{page}/photo_stories with that photo_id → the Story is published
// Returns { ok, id?, error? }. Never throws.
export async function postStoryToFacebookPage({ imageUrl } = {}, cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook Page ID or access token is not set." };
  // Facebook Page Stories are the same full-screen 9:16 canvas as Instagram, so
  // pad the card to 9:16 here too — otherwise a wide/tall card is side-cropped.
  const img = toInstagramStoryUrl(String(imageUrl || "").trim());
  if (!img) return { ok: false, error: "Facebook needs an image to post a Story." };
  const pageToken = await resolvePageToken(cfg);
  const base = `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}`;

  try {
    // 1) Upload the photo without publishing it to the feed.
    const up = await fbGraphPost(`${base}/photos`, { url: img, published: "false" }, pageToken);
    const photoId = up.data?.id;
    if (!up.ok || !photoId) {
      return decorateFbError(up.data?.error?.message || `Story photo upload failed (${up.status}).`, up.status);
    }
    // 2) Publish the Story from that photo.
    const st = await fbGraphPost(`${base}/photo_stories`, { photo_id: String(photoId) }, pageToken);
    const id = st.data?.post_id || st.data?.id;
    if (st.ok && (st.data?.success === true || id)) return { ok: true, id: String(id || photoId) };
    return decorateFbError(st.data?.error?.message || `Story publish failed (${st.status}).`, st.status);
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Facebook." };
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

// Ask Facebook how many posts the connected Page has published — used to
// RECONCILE our own ledger against Meta's own tally. Uses the published_posts
// edge's summary total_count. Best-effort: some post types / permissions can
// make Facebook's number differ from ours, so callers show it for comparison,
// not as a hard equality check. Returns { ok, count? , error? }.
export async function getFacebookPublishedCount(cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook is not connected." };
  const pageToken = await resolvePageToken(cfg);
  try {
    const url = `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}/published_posts?limit=1&summary=total_count&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fbFetch(url);
    const data = await res.json().catch(() => ({}));
    const total = data?.summary?.total_count;
    if (res.ok && typeof total === "number") return { ok: true, count: total };
    return { ok: false, error: data?.error?.message || `Facebook API error (${res.status}).` };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Facebook." };
  }
}

// Write one PERMANENT ledger row per successful Facebook publication (main Page
// and any extra Pages). Fire-and-forget — a ledger write must NEVER break or
// delay posting. Keyed by Meta's post id, independent of FbSchedule. Exported
// for unit tests.
export async function recordFbPublications(pubs, ctx = {}) {
  try {
    const seen = new Set();
    for (const p of pubs || []) {
      const id = p?.id ? String(p.id) : "";
      if (!id || seen.has(id)) continue; // de-dupe within this single call
      seen.add(id);
      // Idempotent by Meta post id: a retry / callback / repeated processing with
      // the SAME id upserts the SAME row (never a second one), so the count can't
      // be inflated. $setOnInsert keeps the first recording's context. This does
      // NOT rely on the unique index alone, so it holds on every DB engine.
      await FbPost.updateOne(
        { facebookPostId: id },
        {
          $setOnInsert: {
            facebookPostId: id,
            pageId: String(p.pageId || ""),
            pageLabel: String(p.pageLabel || ""),
            schedule: ctx.schedule?._id || null,
            scheduleTitle: String(ctx.scheduleTitle || ctx.schedule?.title || "").slice(0, 200),
            sourceLabel: String(ctx.sourceLabel || "").slice(0, 300),
            question: ctx.question?._id || null,
            kind: ctx.kind || "question",
            postSerial: Number.isInteger(ctx.postSerial) ? ctx.postSerial : null,
          },
        },
        { upsert: true }
      ).catch(() => {}); // engine hiccup / unique-race — ignore, never break posting
    }
  } catch { /* never propagate — posting already succeeded */ }
}

// PURE: from the raw per-Page attempt results, decide which Facebook
// publications to RECORD. A publication counts ONLY when the Facebook API call
// succeeded (ok === true) AND returned a real Meta post id (postToFacebookPage
// surfaces `data.post_id || data.id` as `id`). Instagram results are never
// passed in, so Instagram can NEVER contribute to the Facebook count. Also
// de-dupes ids within one call. Exported for unit tests.
export function collectFacebookPublications(attempts) {
  const out = [];
  const seen = new Set();
  for (const a of attempts || []) {
    if (!a || a.ok !== true || !a.id) continue;
    const id = String(a.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, pageId: String(a.pageId || ""), pageLabel: String(a.pageLabel || "") });
  }
  return out;
}

// THE ONE authoritative count of "Facebook posts successfully published by this
// application" — the number of unique rows in the permanent FbPost ledger (one
// row per unique Meta post id). This is the single source of truth for every UI
// figure that means "how many posts did we publish": both "Published by this
// application" (stats) and the reconciliation's applicationCount resolve here.
// There is intentionally NO second counter, and it is NEVER FbSchedule.postCount
// (that is a per-schedule pool-progress counter, not a lifetime total).
//
// Scoping is by (tenantId, pageId) so one Page's — or one institute's — posts
// never leak into another's total:
//   • pageId  — when given, restrict to that connected Page.
//   • tenantId — when given (a real institute id), match that institute's rows
//     PLUS shared/platform (null-tenant) rows, mirroring the tenantId plugin's
//     own read semantics ($in [tid, null]). This keeps the count correct whether
//     or not tenant enforcement stamped a tenantId onto the rows. When tenantId
//     is null/undefined (the default/platform institute, or an out-of-context
//     caller), we leave tenant scoping to the plugin/ambient context exactly as
//     before — so behaviour is unchanged for single-tenant deployments.
export async function countFacebookPosts(tenantId, pageId) {
  const filter = {};
  if (pageId) filter.pageId = String(pageId);
  if (tenantId !== undefined && tenantId !== null) {
    filter.tenantId = { $in: [tenantId, null] };
  }
  return FbPost.countDocuments(filter);
}


// ---------------------------------------------------------------------------
// Scheduled question auto-posting (independent of the Notice Board).
// ---------------------------------------------------------------------------
import FbSchedule from "../models/FbSchedule.js";
import FbPost from "../models/FbPost.js";
import Question from "../models/Question.js";
import Subject from "../models/Subject.js";
import Session from "../models/Session.js";
import Topic from "../models/Topic.js";
import Quiz from "../models/Quiz.js";
import Stream from "../models/Stream.js";
import TestSeries from "../models/TestSeries.js";
import { renderQuestionImage } from "./socialImage.js";
import { renderQuestionCardShot, renderFlashcardCardShot } from "./cardShot.js";
import { isQuestionComplete } from "../utils/questionComplete.js";
import { composeImageAudioToVideo } from "./cloudinary.js";
import { tenantStore, runUnscoped } from "../utils/tenantContext.js";
import { getDefaultTenantId } from "../utils/platformScope.js";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Strip inline-LaTeX $…$ markers so the post reads as plain text on Facebook.
const plain = (s) => String(s || "").replace(/\$/g, "").replace(/[ \t]+\n/g, "\n").trim();

// Turn a label ("Physiography of J&K") into a CamelCase hashtag ("#PhysiographyOfJK").
// Unicode-aware: keeps letters from ANY script (Hindi/Urdu/etc.), not just a–z.
function toTagWords(s) {
  const words = String(s || "").replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return "#" + words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
// Normalise an admin-typed tag ("economics" / "#Economics" → "#Economics").
// Unicode-aware: only punctuation/symbols are stripped, so non-English hashtags
// (e.g. Hindi/Urdu) survive instead of being emptied out ("half worked" before).
function normTag(s) {
  // Keep letters, numbers, combining marks (needed for Indic scripts, e.g. the
  // virama in "हिन्दी") and underscore; strip only punctuation/symbols.
  const t = String(s || "").trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}\p{M}_]/gu, "");
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
  // Running post number ("1. ", "2. ", …) placed at the VERY TOP — prefixing the
  // "Stream › … › Quiz" trail (e.g. "3. Quiz 2"). Putting it here (rather than on
  // the question text) makes it read clearly as the post counter and stops it
  // colliding with questions that themselves begin a numbered statement list.
  const numberPrefix = Number.isInteger(opts.number) && opts.number > 0 ? `${opts.number}. ` : "";
  if (opts.breadcrumb) {
    lines.push(numberPrefix + opts.breadcrumb, "");
    if (q.text) lines.push(plain(q.text));
  } else if (q.text) {
    // No breadcrumb — fall back to numbering the question text directly.
    lines.push(numberPrefix + plain(q.text));
  }

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
// already posted until the pool is exhausted, then cycling. INCOMPLETE questions
// (missing options/statements/columns/assertion-reason etc. — see
// utils/questionComplete.js) are also skipped so we never publish a broken card;
// the number skipped is reported back so the caller can note it. Returns the doc
// as { q, recycled, poolSize, skipped } or { exhausted, poolSize, skipped }.
export async function pickQuestionForSchedule(sch) {
  // A single specific question (scheduled straight from the question view).
  // Nothing to skip TO, so an incomplete one is reported (never posted).
  if (sch.source?.question) {
    const q = await Question.findById(sch.source.question).lean();
    if (!q) return null;
    if (!isQuestionComplete(q).ok) return { exhausted: true, poolSize: 1, skipped: 1 };
    return { q, recycled: false };
  }
  const filter = scopeFilter(sch.source);
  if (!filter) return null;

  const poolSize = await Question.countDocuments(filter); // total questions in this source
  if (poolSize === 0) return null; // no questions at all in this scope

  const postedIds = sch.postedQuestionIds || [];
  const skipped = []; // ids of INCOMPLETE questions skipped during THIS pick

  // Fetch the next candidate that is neither already posted nor skipped this
  // run. Recycles (ignores `posted`) only when the schedule allows it and there
  // is still a complete question to recycle to. Returns { q, recycled } or
  // { exhausted: true }.
  const nextCandidate = async () => {
    const exclude = [...postedIds, ...skipped];
    let useFilter = exclude.length ? { ...filter, _id: { $nin: exclude } } : filter;
    let count = await Question.countDocuments(useFilter);
    let recycled = false;
    if (count === 0) {
      // Nothing unposted (and not-yet-skipped) remains.
      if (sch.stopWhenExhausted !== false) return { exhausted: true };
      // Recycle across the whole pool, but keep this run's skipped-incomplete
      // ones excluded so we can't loop on them forever.
      useFilter = skipped.length ? { ...filter, _id: { $nin: skipped } } : filter;
      count = await Question.countDocuments(useFilter);
      if (count === 0) return { exhausted: true }; // every remaining question is incomplete
      recycled = true;
    }
    let q;
    if (sch.order === "sequential") {
      q = await Question.findOne(useFilter).sort({ createdAt: 1 }).lean();
    } else {
      const skip = Math.floor(Math.random() * count);
      q = await Question.findOne(useFilter).skip(skip).lean();
    }
    return q ? { q, recycled } : { exhausted: true };
  };

  // Try candidates until a COMPLETE one is found, skipping incomplete ones.
  // Cap attempts so a pool of entirely-incomplete questions can't spin forever.
  const maxAttempts = Math.min(poolSize, 500);
  for (let i = 0; i < maxAttempts; i++) {
    const cand = await nextCandidate();
    if (cand.exhausted) return { exhausted: true, poolSize, skipped: skipped.length };
    if (isQuestionComplete(cand.q).ok) {
      return { q: cand.q, recycled: cand.recycled, poolSize, skipped: skipped.length };
    }
    skipped.push(cand.q._id); // incomplete → skip it and try the next one
  }
  return { exhausted: true, poolSize, skipped: skipped.length };
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

// Resolve the Reel music tracks to rotate through. Order of preference:
//   1) a schedule's OWN `customAudios` (per-schedule override, back-compat),
//   2) the legacy single `customAudio` on the schedule,
//   3) the SHARED library on site settings (`site.fbReelAudios`) — the normal
//      path: music is added once in Settings and reused by every Reel schedule.
// Trimmed, non-empty. Exported (pure) for unit tests.
export function resolveReelAudios(sch, site) {
  if (Array.isArray(sch?.customAudios) && sch.customAudios.length) {
    return sch.customAudios.map((u) => String(u || "").trim()).filter(Boolean);
  }
  const one = String(sch?.customAudio || "").trim();
  if (one) return [one];
  if (Array.isArray(site?.fbReelAudios) && site.fbReelAudios.length) {
    return site.fbReelAudios.map((u) => String(u || "").trim()).filter(Boolean);
  }
  return [];
}

// Pick the NEXT track from a rotating library, given the current index. Returns
// the chosen track, the (safely wrapped) index it came from, and the index to
// store for next time — so a set of songs is cycled one per Reel and repeats
// once every track has been used. Exported (pure) for unit tests.
export function nextReelAudio(audios, index) {
  const lib = (Array.isArray(audios) ? audios : []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!lib.length) return { audio: "", index: 0, nextIndex: 0 };
  const i = (((Number(index) || 0) % lib.length) + lib.length) % lib.length;
  return { audio: lib[i], index: i, nextIndex: (i + 1) % lib.length };
}

// Post a CUSTOM schedule (admin-written text + optional uploaded media) once, to
// Facebook and/or Instagram. Unlike a question schedule there's no pool/exhaust
// logic — a recurring custom schedule simply re-posts the same content at each
// slot. Returns { ok, error? } and mutates `sch` bookkeeping (caller saves it).
async function runCustomScheduleOnce(sch, cfg, site, schTitle, { notify = false } = {}) {
  const wantFb = sch.toFacebook !== false;
  const wantIg = !!sch.toInstagram && cfg.igEnabled;
  if (!wantFb && !wantIg) return { ok: false, error: "No destination selected (enable Facebook and/or Instagram)." };

  // Build the message: the admin's text, plus hashtags. Apply the site-wide
  // Default hashtags (+ this schedule's own), exactly like question posts — a
  // custom post has no question, so there are no auto subject/topic tags.
  const text = String(sch.customText || "").trim();
  const tags = await hashtagsForQuestion(null, site, sch.hashtags);
  const message = [text, tags].filter(Boolean).join("\n\n").slice(0, 5000);
  const media = (Array.isArray(sch.customMedia) ? sch.customMedia : []).map((u) => String(u || "").trim()).filter(Boolean);
  const rawImageUrl = media[0] || "";
  // A video turns this into a REEL post (posted to FB and/or IG as a Reel). When
  // set it takes priority over the image — you post either a Reel OR a photo.
  const videoUrl = String(sch.customVideo || "").trim();
  const isReel = !!videoUrl;

  if (!message && !rawImageUrl && !videoUrl) {
    sch.lastRunAt = new Date();
    sch.lastResult = "Failed: a custom post needs text, an image or a video.";
    return { ok: false, error: "A custom post needs text, an image or a video." };
  }

  const notes = [];
  // Track each network INDEPENDENTLY (Instagram success must not mark Facebook posted).
  let fbOk = false; // a Facebook Page (main OR an extra Page) published OK
  let igOk = false; // Instagram published OK
  const fbAttempts = []; // raw per-Page results → collectFacebookPublications() decides what's recorded

  if (wantFb) {
    // Pad an ultra-wide image to Facebook's limit so it isn't side-cropped.
    const fbImageUrl = rawImageUrl ? toFacebookSafeUrl(rawImageUrl) : undefined;
    const r = isReel
      ? await postReelToFacebookPage({ videoUrl, description: message }, cfg)
      : await postToFacebookPage({ message, imageUrl: fbImageUrl }, cfg);
    fbAttempts.push({ ok: r.ok, id: r.id, pageId: cfg.pageId, pageLabel: "" });
    if (r.ok) { fbOk = true; notes.push("Facebook ✓"); } else notes.push(`Facebook ✗ (${r.error})`);

    for (const t of site?.fbExtraTargets || []) {
      const pageId = String(t?.pageId || "").trim();
      const token = String(t?.token || "").trim();
      if (!pageId || !token) continue;
      const rr = isReel
        ? await postReelToFacebookPage({ videoUrl, description: message }, { ...cfg, pageId, token })
        : await postToFacebookPage({ message, imageUrl: fbImageUrl }, { ...cfg, pageId, token });
      const name = t.label || pageId;
      fbAttempts.push({ ok: rr.ok, id: rr.id, pageId, pageLabel: name });
      if (rr.ok) { fbOk = true; notes.push(`${name} ✓`); } else notes.push(`${name} ✗ (${rr.error})`);
    }
  }
  if (wantIg) {
    if (isReel) {
      const r = await postReelToInstagram({ videoUrl, caption: message }, cfg);
      if (r.ok) { igOk = true; notes.push("Instagram ✓"); } else notes.push(`Instagram ✗ (${r.error})`);
    } else if (!rawImageUrl) {
      notes.push("Instagram ✗ (a custom Instagram post needs an image or a video)");
    } else {
      const igImageUrl = toInstagramSafeUrl(rawImageUrl);
      const r = await postToInstagram({ imageUrl: igImageUrl, caption: message }, cfg);
      if (r.ok) { igOk = true; notes.push("Instagram ✓"); } else notes.push(`Instagram ✗ (${r.error})`);
    }
  }

  // ALSO share the uploaded image as a 24h Story (additive, best-effort). A
  // successful Facebook Story is recorded in the ledger too (kind "story").
  const storyFbAttempts = [];
  if (sch.asStory) {
    if (!rawImageUrl) {
      notes.push("Story ✗ (needs an image)");
    } else {
      if (wantFb) {
        const rs = await postStoryToFacebookPage({ imageUrl: rawImageUrl }, cfg);
        storyFbAttempts.push({ ok: rs.ok, id: rs.id, pageId: cfg.pageId, pageLabel: "" });
        notes.push(rs.ok ? "FB Story ✓" : `FB Story ✗ (${rs.error})`);
      }
      if (wantIg) {
        const rs = await postStoryToInstagram({ imageUrl: rawImageUrl }, cfg);
        notes.push(rs.ok ? "IG Story ✓" : `IG Story ✗ (${rs.error})`);
      }
    }
  }

  sch.lastRunAt = new Date();
  // Published to at least one selected network (FB and IG tracked separately).
  const anyOk = fbOk || igOk;
  // Permanent Facebook ledger (survives schedule deletion) — one row per Page publish.
  const fbPublications = collectFacebookPublications(fbAttempts);
  if (fbPublications.length) {
    await recordFbPublications(fbPublications, { schedule: sch, scheduleTitle: schTitle, kind: isReel ? "reel" : "custom", sourceLabel: sch.source?.label });
  }
  // Record Facebook Story publications too, so they aren't missing from the audit.
  const storyPublications = collectFacebookPublications(storyFbAttempts);
  if (storyPublications.length) {
    await recordFbPublications(storyPublications, { schedule: sch, scheduleTitle: schTitle, kind: "story", sourceLabel: sch.source?.label });
  }
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
    // Distinguish a genuine "all posted" completion from a stop caused only by
    // INCOMPLETE questions being skipped — so the admin knows to fix content
    // rather than think the pool is done.
    const blockedByIncomplete = (picked.skipped || 0) > 0;
    sch.enabled = false;
    sch.completedAt = new Date();
    sch.poolSize = picked.poolSize || sch.poolSize || 0;
    sch.lastRunAt = new Date();
    sch.lastResult = blockedByIncomplete
      ? `Paused — no complete question to post. Skipped ${picked.skipped} incomplete question(s) (missing content). Fix them and re-enable.`
      : `Completed — all ${picked.poolSize} question(s) in this source have been posted. Schedule paused.`;
    if (notify && site?.fbNotifyOnComplete !== false) {
      await fbNotify(
        blockedByIncomplete
          ? {
              site,
              subject: `⚠️ Auto-post paused — ${schTitle}`,
              text: `"${sch.source?.label || schTitle}" was paused because no complete question was available to post. ${picked.skipped} incomplete question(s) were skipped (missing options / statements / columns / assertion-reason). Fix them, then re-enable the schedule.`,
              html: `<p>⚠️ <b>${schTitle}</b> was paused.</p><p>No complete question was available to post — <b>${picked.skipped}</b> incomplete question(s) were skipped (missing content such as options, statements, columns or assertion/reason).</p><p>Fix those questions and re-enable the schedule to resume.</p>`,
            }
          : {
              site,
              subject: `✅ Auto-post complete — ${schTitle}`,
              text: `All ${picked.poolSize} question(s) from "${sch.source?.label || schTitle}" have been posted. The schedule was paused automatically so nothing repeats.`,
              html: `<p>✅ <b>${schTitle}</b> has finished.</p><p>All <b>${picked.poolSize}</b> question(s) from <b>${sch.source?.label || "the selected source"}</b> have been posted. The schedule was paused automatically so no questions repeat.</p>`,
            }
      );
    }
    return {
      ok: false,
      exhausted: true,
      completed: !blockedByIncomplete,
      error: blockedByIncomplete
        ? `No complete question to post — ${picked.skipped} incomplete question(s) skipped.`
        : "All questions in this source have been posted.",
    };
  }
  if (!picked || !picked.q) return { ok: false, error: "No published questions found in the selected source." };
  const { q, recycled, poolSize, skipped: skippedIncomplete = 0 } = picked;

  const wantFb = sch.toFacebook !== false;
  const wantIg = !!sch.toInstagram && cfg.igEnabled;
  // A "flashcard" post publishes a combined question+answer IMAGE, so the caption
  // stays light (stem + breadcrumb + hashtags) — the options/answer live in the image.
  const isFlashcard = sch.kind === "flashcard";
  // Global default + auto hashtags (from the question's subject/topic/section)
  // merged with any per-post tags — so every post is tagged consistently.
  const finalTags = await hashtagsForQuestion(q, site, sch.hashtags);
  const breadcrumb = await breadcrumbForQuestion(q);
  // Reserve the next SITE-WIDE post number so every scheduled post is numbered
  // in one continuous sequence (1, 2, 3, …) regardless of which schedule, stream,
  // subject, topic, quiz or flashcard it came from. Atomic $inc avoids two posts
  // grabbing the same number. Only for saved schedules (an ad-hoc "Post now" from
  // the question view has no _id and isn't part of the series). A failed post may
  // leave a small gap — acceptable, and rare.
  let postNumber;
  if ((wantFb || wantIg) && sch._id && site?._id) {
    const bumped = await Settings.findOneAndUpdate(
      { _id: site._id },
      { $inc: { fbPostSerial: 1 } },
      { new: true }
    ).select("fbPostSerial").lean().catch(() => null);
    postNumber = bumped?.fbPostSerial;
  }
  const message = formatQuestionPost(q, {
    includeOptions: isFlashcard ? false : sch.includeOptions,
    includeAnswer: isFlashcard ? false : sch.includeAnswer,
    hashtags: finalTags,
    breadcrumb,
    number: postNumber,
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
  if (isFlashcard) {
    // Combined two-panel flashcard image (question + answer). Best-effort: if the
    // headless render fails, fall back to the normal answer card so a post still
    // goes out.
    try {
      // Use the admin's uploaded flashcard template (overlay mode) when set & enabled.
      const templateUrl = site?.fbFlashcardTemplateEnabled !== false ? String(site?.fbFlashcardTemplateUrl || "").trim() : "";
      const shot = await renderFlashcardCardShot(q, { templateUrl });
      if (shot?.url) imageUrl = shot.url;
      else imageErr = shot?.error || "";
    } catch (e) {
      imageErr = e?.message || String(e);
    }
    if (!imageUrl) {
      const r = await renderQuestionImage(q, { includeOptions: sch.includeOptions, includeAnswer: true, hashtags: finalTags });
      imageUrl = r.url || null;
      imageErr = imageErr || r.error || "";
    }
  } else if (sch.asImage || wantIg || selfieWatermarkActive || textWatermarkActive || sch.asReel || sch.asStory) {
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
  // Note any incomplete questions we skipped to reach this one, so the schedule
  // result shows they were passed over (and should be fixed).
  if (skippedIncomplete > 0) notes.push(`Skipped ${skippedIncomplete} incomplete`);
  // Track each network INDEPENDENTLY so success on one is never attributed to the
  // other (Instagram succeeding must NOT mark Facebook as posted, and vice-versa).
  let fbOk = false;    // a Facebook Page (main OR an extra Page) published OK
  let igOk = false;    // Instagram published OK
  let fbPostId = null; // Meta's post id for the main Page — a real publication reference
  const fbAttempts = []; // raw per-Page results → collectFacebookPublications() decides what's recorded

  // Reel mode: ROTATE through the schedule's music library and mix the NEXT
  // track with the rendered card image into a vertical MP4, published as a Reel
  // (to FB and/or IG) instead of a photo. Each Reel uses the next song, wrapping
  // back to the first once every track has been used. Best-effort — if the card
  // didn't render or Cloudinary can't build the video, we fall back to the
  // normal image/text post so a post still goes out.
  const audioLibrary = resolveReelAudios(sch, site);
  const wantReel = !!sch.asReel && audioLibrary.length > 0;
  let reelVideoUrl = "";
  if (wantReel) {
    const { audio: chosenAudio, index: idx } = nextReelAudio(audioLibrary, sch.audioIndex);
    if (!imageUrl) {
      notes.push("Reel ✗ (no card image — posted as text/image)");
    } else {
      try {
        const composed = await composeImageAudioToVideo({ imageUrl, audioUrl: chosenAudio, durationSec: sch.reelDuration });
        reelVideoUrl = composed?.url || "";
        if (reelVideoUrl) {
          // Advance to the next track for the following run (wraps around).
          sch.audioIndex = (idx + 1) % audioLibrary.length;
        } else {
          notes.push("Reel ✗ (no video URL — posted as image)");
        }
      } catch (e) {
        notes.push(`Reel ✗ (${e?.message || e} — posted as image)`);
      }
    }
  }

  if (wantFb) {
    // Always attach the image when a selfie watermark is active (ensures branding on every post).
    // A very SHORT/WIDE card (e.g. a plain MCQ) can exceed Facebook's widest
    // supported ratio (1.91:1) and get its sides cropped in the feed, cutting off
    // the option letters / start of each line. Pad only such a card DOWN to
    // 1.91:1 (a tiny white sliver, NOT a tall canvas) so Facebook shows it in
    // full. Cards already within range are left untouched. See
    // utils/facebookImage.js.
    const fbRawImageUrl = (sch.asImage || selfieWatermarkActive || isFlashcard) ? imageUrl : undefined;
    const fbImageUrl = fbRawImageUrl ? toFacebookSafeUrl(fbRawImageUrl) : undefined;
    // In Reel mode publish the composed video as a Reel; otherwise the normal
    // photo/text post. Same per-Page helper covers the main Page + extra Pages.
    const postFb = (pageCfg) => reelVideoUrl
      ? postReelToFacebookPage({ videoUrl: reelVideoUrl, description: message }, pageCfg)
      : postToFacebookPage({ message, link, imageUrl: fbImageUrl }, pageCfg);
    const r = await postFb(cfg);
    fbAttempts.push({ ok: r.ok, id: r.id, pageId: cfg.pageId, pageLabel: "" });
    if (r.ok) { fbOk = true; fbPostId = r.id || fbPostId; notes.push("Facebook ✓"); } else notes.push(`Facebook ✗ (${r.error})`);

    // Cross-post to any extra Facebook Pages the admin added (each with its own
    // token). Groups are NOT supported by the Facebook API, so only Pages work.
    for (const t of site?.fbExtraTargets || []) {
      const pageId = String(t?.pageId || "").trim();
      const token = String(t?.token || "").trim();
      if (!pageId || !token) continue;
      const rr = await postFb({ ...cfg, pageId, token });
      const name = t.label || pageId;
      fbAttempts.push({ ok: rr.ok, id: rr.id, pageId, pageLabel: name });
      if (rr.ok) { fbOk = true; notes.push(`${name} ✓`); } else notes.push(`${name} ✗ (${rr.error})`);
    }
  }
  if (wantIg) {
    if (reelVideoUrl) {
      // Publish the composed video as an Instagram Reel.
      const r = await postReelToInstagram({ videoUrl: reelVideoUrl, caption: message }, cfg);
      if (r.ok) { igOk = true; notes.push("Instagram ✓"); } else notes.push(`Instagram ✗ (${r.error})`);
    } else if (!imageUrl) {
      notes.push(`Instagram ✗ (image failed${imageErr ? `: ${imageErr}` : ""})`);
    } else {
      // Question cards render at a VARIABLE height, so a tall card falls below
      // Instagram's minimum 4:5 aspect ratio and the API rejects it ("The aspect
      // ratio is not supported."). Pad the (Cloudinary-hosted) image onto a 4:5
      // canvas for Instagram only — Facebook already got the untouched image and
      // accepts any ratio. Padding never crops, so the full card stays visible.
      const igImageUrl = toInstagramSafeUrl(imageUrl);
      const r = await postToInstagram({ imageUrl: igImageUrl, caption: message }, cfg);
      if (r.ok) { igOk = true; notes.push("Instagram ✓"); } else notes.push(`Instagram ✗ (${r.error})`);
    }
  }
  if (!wantFb && !wantIg) return { ok: false, error: "No destination selected (enable Facebook and/or Instagram)." };

  // ALSO share the card image as a 24h Story (in addition to the feed/reel post),
  // to whichever networks are selected. Additive & best-effort — a Story failure
  // never changes the main post's success. A successful Facebook Story is a real
  // publication, so it's recorded in the ledger too (kind "story") — otherwise
  // Stories would be MISSING from the Facebook audit.
  const storyFbAttempts = [];
  if (sch.asStory) {
    if (!imageUrl) {
      notes.push("Story ✗ (no card image)");
    } else {
      if (wantFb) {
        const rs = await postStoryToFacebookPage({ imageUrl }, cfg);
        storyFbAttempts.push({ ok: rs.ok, id: rs.id, pageId: cfg.pageId, pageLabel: "" });
        notes.push(rs.ok ? "FB Story ✓" : `FB Story ✗ (${rs.error})`);
      }
      if (wantIg) {
        const rs = await postStoryToInstagram({ imageUrl }, cfg);
        notes.push(rs.ok ? "IG Story ✓" : `IG Story ✗ (${rs.error})`);
      }
    }
  }

  // A post counts as "made" (advance the pool / mark the question posted) when it
  // published to at least ONE selected network. FB and IG are tracked separately
  // above, so one network's failure never hides — or fakes — the other's outcome.
  const anyOk = fbOk || igOk;

  // Permanent Facebook ledger: one row per Page publish (main + extras), keyed by
  // Meta's post id. Independent of this schedule, so the lifetime count survives.
  const fbPublications = collectFacebookPublications(fbAttempts);
  if (fbPublications.length) {
    await recordFbPublications(fbPublications, {
      schedule: sch, scheduleTitle: schTitle, question: q,
      kind: reelVideoUrl ? "reel" : (isFlashcard ? "flashcard" : "question"), sourceLabel: sch.source?.label, postSerial: postNumber,
    });
  }
  // Record Facebook Story publications too (kind "story"), so they aren't
  // missing from the audit/lifetime count.
  const storyPublications = collectFacebookPublications(storyFbAttempts);
  if (storyPublications.length) {
    await recordFbPublications(storyPublications, {
      schedule: sch, scheduleTitle: schTitle, question: q, kind: "story", sourceLabel: sch.source?.label,
    });
  }

  sch.lastRunAt = new Date();
  if (poolSize) sch.poolSize = poolSize;
  let finishedPool = false; // true when THIS successful post just emptied the pool
  if (anyOk) {
    sch.postedQuestionIds = recycled ? [q._id] : [...(sch.postedQuestionIds || []), q._id];
    sch.postCount = (sch.postCount || 0) + 1;
    const postedCount = (sch.postedQuestionIds || []).length;
    // Did this post finish the WHOLE source (stop-when-exhausted, no recycle)?
    // If so the caller removes the schedule — it "disappears" right after the
    // final successful post (e.g. the 25th question of a 25-question quiz).
    finishedPool = !recycled && sch.stopWhenExhausted !== false && poolSize > 0 && postedCount >= poolSize;
    sch.lastResult = finishedPool
      ? `Completed — all ${poolSize} question(s) posted.`
      : `${notes.join(" · ")}${recycled ? " (restarted the pool)" : ""}`;
    if (finishedPool && notify && site?.fbNotifyOnComplete !== false) {
      await fbNotify({
        site,
        subject: `✅ Auto-post complete — ${schTitle}`,
        text: `All ${poolSize} question(s) from "${sch.source?.label || schTitle}" have been posted. The schedule finished and was removed.`,
        html: `<p>✅ <b>${schTitle}</b> has finished.</p><p>All <b>${poolSize}</b> question(s) from <b>${sch.source?.label || "the selected source"}</b> have been posted — the schedule was removed automatically.</p>`,
      });
    } else if (notify && site?.fbNotifyOnPost === true) {
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
  return { ok: anyOk, error: anyOk ? undefined : notes.join(" · "), id: fbPostId || undefined, fbOk, igOk, completed: finishedPool };
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
      // Disappear-on-success: a ONE-TIME post, OR a recurring schedule that just
      // finished its whole pool (the final question posted), is deleted so it's
      // gone from the list. A failed post is kept (with its error) for retry.
      if (r?.ok && (sch.mode === "once" || r.completed)) await FbSchedule.deleteOne({ _id: sch._id });
      else await sch.save();
    } catch (e) {
      sch.lastResult = `Error: ${e.message}`;
      if (stats) stats.lastError = e.message;
      await sch.save().catch(() => {});
    }
  }
}
