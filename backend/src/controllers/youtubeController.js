// YouTube connection management (admin): status, settings, OAuth connect /
// callback, disconnect and a connection test. Each tenant connects its OWN
// channel — everything is saved on the caller's own Settings doc.
import Settings from "../models/Settings.js";
import { getOrCreateOwn } from "./settingsController.js";
import { runUnscoped } from "../utils/tenantContext.js";
import { clientBaseFromReq } from "../config/clientUrl.js";
import {
  ytClientCreds, ytRedirectUri, youtubeConfigFromSite, signYtState, verifyYtState,
  buildYtAuthUrl, exchangeYtCode, getYtAccessToken, getYtChannel, revokeYtToken,
  encryptYtSecret, YT_PRIVACY, isYoutubeConfigured,
  scopesAllowPlaylists, getYtGrantedScopes, listYtPlaylists, createYtPlaylist, cleanYtPlaylistId,
  thumbConfigFromSite, thumbnailLines, applyYtExtras, YT_THUMB_POSITIONS, YT_THUMB_FONTS, cleanThumbBox,
} from "../config/youtube.js";
import { isSafePublicUrl } from "../utils/urlGuard.js";
import { getFacebookConfig, getFacebookSiteForConfig, completeQuestionsForSource, isFacebookConfigured } from "../config/facebook.js";
import {
  queueFullQuizVideo, normalizeLongVideoOptions, listLongVideoJobs, getLongVideoJob, publicJob, tenantKeyNow, MAX_LONG_VIDEO_QUESTIONS,
} from "../config/longVideo.js";

function statusOf(site, req) {
  const { clientId, clientSecret } = ytClientCreds(site);
  return {
    enabled: !!site?.ytEnabled,
    connected: !!site?.ytRefreshToken,
    channelTitle: site?.ytChannelTitle || "",
    channelId: site?.ytChannelId || "",
    connectedAt: site?.ytConnectedAt || null,
    privacy: YT_PRIVACY.includes(site?.ytPrivacy) ? site.ytPrivacy : "public",
    clientId: site?.ytClientId || "",
    clientSecretSet: !!site?.ytClientSecret,
    usingEnvCredentials: !site?.ytClientId && !!process.env.YOUTUBE_CLIENT_ID,
    credentialsReady: !!(clientId && clientSecret),
    redirectUri: ytRedirectUri(req),
    // Playlists ("folders") need the youtube.force-ssl permission (older
    // connections must reconnect once). Unknown scopes → assume not granted.
    canPlaylists: scopesAllowPlaylists(site?.ytScopes),
    shortsPlaylist: site?.ytShortsPlaylistId ? { id: site.ytShortsPlaylistId, title: site.ytShortsPlaylistTitle || "" } : null,
    longPlaylist: site?.ytLongPlaylistId ? { id: site.ytLongPlaylistId, title: site.ytLongPlaylistTitle || "" } : null,
    thumb: thumbConfigFromSite(site),
    // Saved long-video form settings (null = never saved → the form uses the AI Slideshow ones).
    longVideoDefaults: site?.longVideoDefaults || null,
  };
}

const hexColor = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "").trim()) ? String(v).trim().toLowerCase() : d);
// { id, title } | null → the playlist fields to store.
function playlistFields(v) {
  const id = cleanYtPlaylistId(v?.id);
  return { id, title: id ? String(v?.title || "").replace(/[<>]/g, "").trim().slice(0, 150) : "" };
}
// Apply thumbnail-template fields from a request body onto an object (the
// Settings doc when saving, or a plain copy for a live preview).
function applyThumbFields(target, b) {
  if ("thumbTemplateUrl" in b) {
    const u = String(b.thumbTemplateUrl || "").trim();
    target.ytThumbTemplateUrl = u && /^https?:\/\//i.test(u) && isSafePublicUrl(u) ? u.slice(0, 1000) : "";
  }
  if ("thumbEnabled" in b) target.ytThumbEnabled = !!b.thumbEnabled;
  if ("thumbShowText" in b) target.ytThumbShowText = !!b.thumbShowText;
  if ("thumbPosition" in b) target.ytThumbTextPosition = YT_THUMB_POSITIONS.includes(b.thumbPosition) ? b.thumbPosition : "left";
  if ("thumbTextColor" in b) target.ytThumbTextColor = hexColor(b.thumbTextColor, "#ffffff");
  if ("thumbAccentColor" in b) target.ytThumbAccentColor = hexColor(b.thumbAccentColor, "#facc15");
  // Text box (where the subject/topic/quiz fill the template's empty area).
  if ("thumbBox" in b) target.ytThumbBox = cleanThumbBox(b.thumbBox);
  if ("thumbAlign" in b) target.ytThumbAlign = ["left", "center", "right"].includes(b.thumbAlign) ? b.thumbAlign : "left";
  if ("thumbVAlign" in b) target.ytThumbVAlign = ["top", "center", "bottom"].includes(b.thumbVAlign) ? b.thumbVAlign : "center";
  if ("thumbFont" in b) target.ytThumbFont = YT_THUMB_FONTS.includes(b.thumbFont) ? b.thumbFont : "sans";
  if ("thumbUppercase" in b) target.ytThumbUppercase = !!b.thumbUppercase;
  if ("thumbKickerColor" in b) target.ytThumbKickerColor = b.thumbKickerColor ? hexColor(b.thumbKickerColor, "") : "";
  if ("thumbBadgeTextColor" in b) target.ytThumbBadgeTextColor = hexColor(b.thumbBadgeTextColor, "#111111");
  if ("thumbStrokeColor" in b) target.ytThumbStrokeColor = hexColor(b.thumbStrokeColor, "#000000");
  if ("thumbStrokeWidth" in b) target.ytThumbStrokeWidth = clampInt(b.thumbStrokeWidth, 3, 0, 16);
  if ("thumbShadow" in b) target.ytThumbShadow = !!b.thumbShadow;
  if ("thumbPanelColor" in b) target.ytThumbPanelColor = b.thumbPanelColor ? hexColor(b.thumbPanelColor, "") : "";
  if ("thumbPanelOpacity" in b) target.ytThumbPanelOpacity = clampInt(b.thumbPanelOpacity, 0, 0, 100);
  if ("thumbPanelRadius" in b) target.ytThumbPanelRadius = clampInt(b.thumbPanelRadius, 24, 0, 80);
  if ("thumbHeadlineSize" in b) target.ytThumbHeadlineSize = clampInt(b.thumbHeadlineSize, 104, 24, 200);
  if ("thumbKickerSize" in b) target.ytThumbKickerSize = clampInt(b.thumbKickerSize, 44, 12, 120);
  if ("thumbBadgeSize" in b) target.ytThumbBadgeSize = clampInt(b.thumbBadgeSize, 46, 12, 120);
  if ("thumbLineHeight" in b) { const n = Number(b.thumbLineHeight); target.ytThumbLineHeight = Number.isFinite(n) ? Math.max(0.8, Math.min(2, n)) : 1.05; }
  if ("thumbRotate" in b) target.ytThumbRotate = clampInt(b.thumbRotate, 0, -180, 180);
}
const clampInt = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

// GET /api/youtube/status
export async function youtubeStatus(req, res) {
  const site = await getOrCreateOwn();
  res.json(statusOf(site, req));
}

// PUT /api/youtube/settings — { enabled?, privacy?, clientId?, clientSecret?,
//   shortsPlaylist?:{id,title}|null, longPlaylist?:{id,title}|null,
//   thumbTemplateUrl?, thumbEnabled?, thumbShowText?, thumbPosition?, thumbTextColor?, thumbAccentColor? }
// A blank clientSecret keeps the saved one (same pattern as the FB token).
export async function saveYoutubeSettings(req, res) {
  const site = await getOrCreateOwn();
  const b = req.body || {};
  if ("enabled" in b) site.ytEnabled = !!b.enabled;
  if ("privacy" in b) site.ytPrivacy = YT_PRIVACY.includes(b.privacy) ? b.privacy : "public";
  if ("clientId" in b) {
    const id = String(b.clientId || "").trim().slice(0, 200);
    if (id && id !== site.ytClientId && site.ytRefreshToken) {
      // A different OAuth app can't use the old refresh token.
      site.ytRefreshToken = ""; site.ytChannelId = ""; site.ytChannelTitle = ""; site.ytConnectedAt = null;
    }
    site.ytClientId = id;
  }
  if ("clientSecret" in b) {
    const sec = String(b.clientSecret || "").trim();
    if (sec) site.ytClientSecret = encryptYtSecret(sec.slice(0, 200));
  }
  if ("shortsPlaylist" in b) { const p = playlistFields(b.shortsPlaylist); site.ytShortsPlaylistId = p.id; site.ytShortsPlaylistTitle = p.title; }
  if ("longPlaylist" in b) { const p = playlistFields(b.longPlaylist); site.ytLongPlaylistId = p.id; site.ytLongPlaylistTitle = p.title; }
  applyThumbFields(site, b);
  await site.save();
  res.json(statusOf(site, req));
}

// POST /api/youtube/connect → { url } — the browser navigates there (Google login).
export async function youtubeConnect(req, res) {
  const site = await getOrCreateOwn();
  const { clientId, clientSecret } = ytClientCreds(site);
  if (!clientId || !clientSecret) {
    return res.status(400).json({ message: "Add your Google OAuth Client ID and Client secret first (see the setup steps)." });
  }
  const redirectUri = ytRedirectUri(req);
  const returnTo = `${clientBaseFromReq(req)}/admin/facebook`;
  let state;
  try {
    state = signYtState({ sid: String(site._id), ru: redirectUri, rt: returnTo, uid: req.user?._id ? String(req.user._id) : "" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
  res.json({ url: buildYtAuthUrl({ clientId, redirectUri, state }), redirectUri });
}

// GET /api/youtube/oauth/callback?code&state — PUBLIC (Google redirects here).
// Security comes from the HMAC-signed, short-lived `state`, which pins the exact
// Settings doc (tenant) the admin started from.
export async function youtubeCallback(req, res) {
  const data = verifyYtState(req.query.state);
  const back = (params) => {
    const fallback = `${String(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "")}/admin/facebook`;
    let u;
    try { u = new URL(data?.rt || fallback); } catch { u = new URL("http://localhost:5173/admin/facebook"); }
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return res.redirect(u.toString());
  };
  if (!data) return back({ youtube: "error", reason: "The connection link expired or was invalid — please try again." });
  if (req.query.error) return back({ youtube: "error", reason: req.query.error === "access_denied" ? "You cancelled the Google permission screen." : String(req.query.error) });
  const code = String(req.query.code || "");
  if (!code) return back({ youtube: "error", reason: "Google did not return an authorisation code." });

  try {
    const site = await runUnscoped(() => Settings.findById(data.sid));
    if (!site) return back({ youtube: "error", reason: "Settings not found." });
    const { clientId, clientSecret } = ytClientCreds(site);
    const { refreshToken, accessToken, scope } = await exchangeYtCode({ code, clientId, clientSecret, redirectUri: data.ru });
    if (!refreshToken) return back({ youtube: "error", reason: "Google did not return a refresh token. Remove the app's access at myaccount.google.com/permissions and connect again." });
    let channel = null;
    try { channel = await getYtChannel(accessToken); } catch { /* channel name is cosmetic */ }
    if (!channel) return back({ youtube: "error", reason: "This Google account has no YouTube channel. Create one on YouTube, then connect again." });
    await runUnscoped(() => Settings.updateOne({ _id: site._id }, {
      $set: {
        ytRefreshToken: encryptYtSecret(refreshToken),
        ytChannelId: channel.id,
        ytChannelTitle: channel.title,
        ytConnectedAt: new Date(),
        ytEnabled: true,
        ytScopes: scope,
        // A different channel → its playlists don't apply any more.
        ...(site.ytChannelId && site.ytChannelId !== channel.id
          ? { ytShortsPlaylistId: "", ytShortsPlaylistTitle: "", ytLongPlaylistId: "", ytLongPlaylistTitle: "" }
          : {}),
      },
    }));
    return back({ youtube: "connected" });
  } catch (e) {
    return back({ youtube: "error", reason: String(e?.message || "Could not connect YouTube.").slice(0, 200) });
  }
}

// POST /api/youtube/disconnect
export async function youtubeDisconnect(req, res) {
  const site = await getOrCreateOwn();
  const cfg = youtubeConfigFromSite(site);
  await revokeYtToken(cfg.ytRefreshToken);
  site.ytRefreshToken = ""; site.ytChannelId = ""; site.ytChannelTitle = ""; site.ytConnectedAt = null; site.ytEnabled = false;
  site.ytScopes = "";
  await site.save();
  res.json(statusOf(site, req));
}

// ---- Long videos ----
const oid = (v) => (/^[a-f0-9]{24}$/i.test(String(v || "").trim()) ? String(v).trim() : null);
const cleanPublishAt = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) || d.getTime() < Date.now() + 5 * 60 * 1000 ? null : d.toISOString();
};

// POST /api/youtube/long-video — make ONE 16:9 video of every question in a
// source and upload it. Body: { source:{subject,session,quiz,testSeries,label},
// title?, privacy?, publishAt?, hashtags? } → { job } (poll GET …/:id).
export async function startLongVideo(req, res) {
  const b = req.body || {};
  const src = b.source || {};
  const source = {
    subject: oid(src.subject), session: oid(src.session), quiz: oid(src.quiz), testSeries: oid(src.testSeries),
    label: String(src.label || "").trim().slice(0, 300),
  };
  if (!source.subject && !source.session && !source.quiz && !source.testSeries) {
    return res.status(400).json({ message: "Pick the content (a subject, topic session, quiz or My Quiz) first." });
  }
  // A publish time that was sent but can't be used is an error — never
  // silently publish right away instead of at the chosen time.
  if (b.publishAt && !cleanPublishAt(b.publishAt)) {
    return res.status(400).json({ message: "The scheduled time must be a valid date at least 5 minutes from now." });
  }
  const cfg = await getFacebookConfig();
  const site = await getFacebookSiteForConfig(cfg);
  try {
    const job = queueFullQuizVideo({
      source, cfg, site,
      titleTemplate: String(b.title || "").replace(/[<>]/g, "").trim().slice(0, 100),
      privacy: YT_PRIVACY.includes(b.privacy) ? b.privacy : cfg.ytPrivacy,
      publishAt: cleanPublishAt(b.publishAt),
      hashtags: String(b.hashtags || "").trim().slice(0, 1000),
      // Playlist: absent → the default long-video playlist; {id:""} → none.
      ...("playlist" in b ? { playlist: playlistFields(b.playlist).id ? playlistFields(b.playlist) : null } : {}),
      useThumbnail: b.useThumbnail !== false,
      // How many questions, narration / slides and where to post (blank = saved defaults).
      options: b.options && typeof b.options === "object" ? b.options : {},
    });
    res.status(202).json({ job });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

// POST /api/youtube/long-video/count { source } → { total, max, facebookReady, youtubeReady }
// How many complete questions the picked content has (for "how many questions").
export async function longVideoQuestionCount(req, res) {
  const src = req.body?.source || {};
  const source = { subject: oid(src.subject), session: oid(src.session), quiz: oid(src.quiz), testSeries: oid(src.testSeries) };
  const cfg = await getFacebookConfig();
  const ready = { max: MAX_LONG_VIDEO_QUESTIONS, youtubeReady: isYoutubeConfigured(cfg), facebookReady: isFacebookConfigured(cfg) };
  if (!source.subject && !source.session && !source.quiz && !source.testSeries) return res.json({ total: 0, ...ready });
  const all = await completeQuestionsForSource(source).catch(() => []);
  res.json({ total: all.length, ...ready });
}

// PUT /api/youtube/long-video/defaults { options } → status. "Save settings
// only": the long-video form opens with these next time.
export async function saveLongVideoDefaults(req, res) {
  const site = await getOrCreateOwn();
  const o = normalizeLongVideoOptions(req.body?.options || {}, site);
  delete o.start; delete o.part;
  site.longVideoDefaults = o;
  site.markModified?.("longVideoDefaults");
  await site.save();
  res.json(statusOf(site, req));
}

// GET /api/youtube/long-video — recent long-video jobs (this institute).
export async function listLongVideos(req, res) {
  const cfg = await getFacebookConfig();
  res.json({ jobs: listLongVideoJobs(tenantKeyNow()), maxQuestions: MAX_LONG_VIDEO_QUESTIONS, youtubeReady: isYoutubeConfigured(cfg), facebookReady: isFacebookConfigured(cfg) });
}

// GET /api/youtube/long-video/:id
export async function longVideoStatus(req, res) {
  const j = getLongVideoJob(req.params.id, tenantKeyNow());
  if (!j) return res.status(404).json({ message: "Job not found (it may have expired or the server restarted)." });
  res.json({ job: publicJob(j) });
}

// POST /api/youtube/upload-token — a SHORT-LIVED (≤1 h) access token so the
// admin's browser can upload a big video file STRAIGHT to YouTube (the file
// never passes through our server — no size limit here). Admin only; the
// long-lived refresh token never leaves the server.
export async function youtubeUploadToken(req, res) {
  const site = await getOrCreateOwn();
  const cfg = youtubeConfigFromSite(site);
  if (!cfg.ytRefreshToken || !cfg.ytEnabled) return res.status(400).json({ message: "Connect YouTube (and switch uploads on) first." });
  try {
    const accessToken = await getYtAccessToken(cfg);
    res.set("Cache-Control", "no-store");
    res.json({ accessToken, privacy: cfg.ytPrivacy, channelTitle: site.ytChannelTitle || "" });
  } catch (e) {
    res.status(400).json({ message: e.message || "Could not get a YouTube upload token." });
  }
}

// POST /api/youtube/test — checks the saved connection works (no upload).
export async function youtubeTest(req, res) {
  const site = await getOrCreateOwn();
  const cfg = youtubeConfigFromSite(site);
  if (!cfg.ytRefreshToken) return res.status(400).json({ message: "YouTube is not connected yet." });
  try {
    const token = await getYtAccessToken(cfg);
    const ch = await getYtChannel(token);
    if (!ch) return res.status(400).json({ message: "Connected Google account has no YouTube channel." });
    const scopes = await getYtGrantedScopes(cfg).catch(() => "");
    if (ch.title !== site.ytChannelTitle || ch.id !== site.ytChannelId || (scopes && scopes !== site.ytScopes)) {
      site.ytChannelTitle = ch.title; site.ytChannelId = ch.id;
      if (scopes) site.ytScopes = scopes;
      await site.save();
    }
    res.json({ ok: true, channelTitle: ch.title, channelId: ch.id });
  } catch (e) {
    res.status(400).json({ message: e.message || "YouTube connection test failed." });
  }
}

// ---- Playlists ("folders") ----

// GET /api/youtube/playlists → { playlists:[{id,title,privacy,count}], canCreate }
export async function youtubePlaylists(req, res) {
  const site = await getOrCreateOwn();
  const cfg = youtubeConfigFromSite(site);
  if (!cfg.ytRefreshToken) return res.status(400).json({ message: "Connect YouTube first." });
  try {
    res.json({ playlists: await listYtPlaylists(cfg), canCreate: scopesAllowPlaylists(site.ytScopes) });
  } catch (e) {
    res.status(400).json({ message: e.message || "Could not load your playlists." });
  }
}

// POST /api/youtube/playlists { title, privacy? } → { playlist }
export async function youtubeCreatePlaylist(req, res) {
  const site = await getOrCreateOwn();
  const cfg = youtubeConfigFromSite(site);
  if (!cfg.ytRefreshToken) return res.status(400).json({ message: "Connect YouTube first." });
  try {
    const b = req.body || {};
    const playlist = await createYtPlaylist({ title: b.title, privacy: YT_PRIVACY.includes(b.privacy) ? b.privacy : "public" }, cfg);
    // It worked, so this connection has the playlist permission.
    if (!scopesAllowPlaylists(site.ytScopes)) {
      site.ytScopes = `${site.ytScopes || ""} https://www.googleapis.com/auth/youtube.force-ssl`.trim();
      await site.save();
    }
    res.status(201).json({ playlist });
  } catch (e) {
    res.status(400).json({ message: e.message || "Could not create the playlist." });
  }
}

// ---- Thumbnail template ----

// POST /api/youtube/thumbnail-preview { title?|subject?,topic?,count?, …unsaved thumb fields }
// → { image: "data:image/jpeg;base64,…" }. Uses the saved template, overridden by any fields in the body
// so the admin sees changes before saving.
export async function youtubeThumbnailPreview(req, res) {
  const site = await getOrCreateOwn();
  const b = req.body || {};
  // Seed from ALL saved thumbnail fields, then apply the unsaved edits in `b`,
  // so the preview matches what a real video would draw.
  const THUMB_KEYS = ["ytThumbTemplateUrl", "ytThumbEnabled", "ytThumbShowText", "ytThumbTextPosition",
    "ytThumbTextColor", "ytThumbAccentColor", "ytThumbBox", "ytThumbAlign", "ytThumbVAlign", "ytThumbFont",
    "ytThumbUppercase", "ytThumbKickerColor", "ytThumbBadgeTextColor", "ytThumbStrokeColor", "ytThumbStrokeWidth",
    "ytThumbShadow", "ytThumbPanelColor", "ytThumbPanelOpacity", "ytThumbPanelRadius",
    "ytThumbHeadlineSize", "ytThumbKickerSize", "ytThumbBadgeSize", "ytThumbLineHeight", "ytThumbRotate"];
  const draft = Object.fromEntries(THUMB_KEYS.map((k) => [k, site[k]]));
  draft.ytThumbEnabled = true;
  applyThumbFields(draft, { ...b, thumbEnabled: true });
  const thumb = thumbConfigFromSite(draft);
  if (!thumb.templateUrl) return res.status(400).json({ message: "Upload a thumbnail template first." });
  // Sample text for the preview — each real video fills in its own names.
  const lines = thumbnailLines({
    subject: String(b.subject ?? "Subject Name").slice(0, 100),
    topic: String(b.topic ?? "Topic Name").slice(0, 100),
    quiz: String(b.quiz ?? "Quiz 1").slice(0, 100),
    count: Number(b.count ?? 25) || 0,
    title: String(b.title || "").slice(0, 100),
  });
  const { renderYoutubeThumbnail } = await import("../config/ytThumbnail.js");
  const r = await renderYoutubeThumbnail({ ...thumb, lines, brandColor: site.brandColor || site.primaryColor });
  if (!r.image) return res.status(400).json({ message: r.error || "Could not draw the thumbnail." });
  res.set("Cache-Control", "no-store");
  res.json({ image: `data:${r.mime};base64,${r.image.toString("base64")}`, bytes: r.image.length });
}

// POST /api/youtube/videos/:videoId/finish { title?, useThumbnail?, playlist?:{id,title} }
// After a browser upload (your own video): set the template thumbnail and/or
// add it to a playlist. → { notes:[…] }
export async function youtubeFinishUpload(req, res) {
  const videoId = String(req.params.videoId || "");
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return res.status(400).json({ message: "Invalid video id." });
  const site = await getOrCreateOwn();
  const cfg = youtubeConfigFromSite(site);
  if (!isYoutubeConfigured(cfg)) return res.status(400).json({ message: "Connect YouTube first." });
  const b = req.body || {};
  const playlist = playlistFields(b.playlist);
  const notes = await applyYtExtras({
    videoId,
    thumb: b.useThumbnail ? { ...cfg.ytThumb, lines: thumbnailLines({ title: String(b.title || "").slice(0, 100) }) } : null,
    playlist: playlist.id ? playlist : null,
    brandColor: site.brandColor || site.primaryColor,
  }, cfg);
  res.json({ notes });
}
