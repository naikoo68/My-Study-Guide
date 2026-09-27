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
  encryptYtSecret, YT_PRIVACY,
} from "../config/youtube.js";

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
