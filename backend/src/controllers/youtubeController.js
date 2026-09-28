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
} from "../config/youtube.js";
import { getFacebookConfig, getFacebookSiteForConfig } from "../config/facebook.js";
import {
  queueFullQuizVideo, listLongVideoJobs, getLongVideoJob, publicJob, tenantKeyNow, MAX_LONG_VIDEO_QUESTIONS,
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
  };
}

// GET /api/youtube/status
export async function youtubeStatus(req, res) {
  const site = await getOrCreateOwn();
  res.json(statusOf(site, req));
}

// PUT /api/youtube/settings — { enabled?, privacy?, clientId?, clientSecret? }
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
    const { refreshToken, accessToken } = await exchangeYtCode({ code, clientId, clientSecret, redirectUri: data.ru });
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
  const cfg = await getFacebookConfig();
  if (!isYoutubeConfigured(cfg)) return res.status(400).json({ message: "Connect YouTube first (YouTube Shorts card)." });
  const site = await getFacebookSiteForConfig(cfg);
  try {
    const job = queueFullQuizVideo({
      source, cfg, site,
      titleTemplate: String(b.title || "").replace(/[<>]/g, "").trim().slice(0, 100),
      privacy: YT_PRIVACY.includes(b.privacy) ? b.privacy : cfg.ytPrivacy,
      publishAt: cleanPublishAt(b.publishAt),
      hashtags: String(b.hashtags || "").trim().slice(0, 1000),
    });
    res.status(202).json({ job });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

// GET /api/youtube/long-video — recent long-video jobs (this institute).
export async function listLongVideos(req, res) {
  res.json({ jobs: listLongVideoJobs(tenantKeyNow()), maxQuestions: MAX_LONG_VIDEO_QUESTIONS });
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
    if (ch.title !== site.ytChannelTitle || ch.id !== site.ytChannelId) {
      site.ytChannelTitle = ch.title; site.ytChannelId = ch.id; await site.save();
    }
    res.json({ ok: true, channelTitle: ch.title, channelId: ch.id });
  } catch (e) {
    res.status(400).json({ message: e.message || "YouTube connection test failed." });
  }
}
