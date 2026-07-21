import Settings from "../models/Settings.js";

// Facebook Page auto-posting via the Graph API. The Page ID + long-lived Page
// access token are stored in the singleton Settings document (entered by the
// admin in the panel) and NEVER exposed to the browser. Outbound calls use the
// global fetch (Node 18+), matching the mailer's HTTP style.

export async function getFacebookConfig() {
  const s = await Settings.findOne({ key: "site" }).lean();
  return {
    enabled: !!s?.fbEnabled,
    pageId: String(s?.fbPageId || "").trim(),
    token: String(s?.fbPageAccessToken || "").trim(),
    version: String(s?.fbGraphVersion || "v21.0").trim() || "v21.0",
    autoOnNotice: !!s?.fbAutoOnNotice,
  };
}

export const isFacebookConfigured = (cfg) => !!(cfg?.pageId && cfg?.token);

// Post a message (with an optional link) to the configured Facebook Page feed.
// Returns { ok, id?, error? }. Safe to call fire-and-forget — it never throws.
export async function postToFacebookPage({ message, link } = {}, cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook Page ID or access token is not set." };

  const msg = String(message || "").trim();
  const lnk = String(link || "").trim();
  if (!msg && !lnk) return { ok: false, error: "Nothing to post (empty message)." };

  const url = `https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}/feed`;
  const body = new URLSearchParams();
  if (msg) body.set("message", msg);
  if (lnk) body.set("link", lnk);
  body.set("access_token", cfg.token);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.id) return { ok: true, id: data.id };
    return { ok: false, error: data?.error?.message || `Facebook API error (${res.status}).` };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Facebook." };
  }
}

// Verify the token/page WITHOUT posting — reads the Page name via the Graph API.
export async function verifyFacebook(cfgOverride) {
  const cfg = cfgOverride || (await getFacebookConfig());
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Add your Page ID and Page access token first." };
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}?fields=name&access_token=${encodeURIComponent(cfg.token)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.name) return { ok: true, name: data.name };
    return { ok: false, error: data?.error?.message || `Facebook API error (${res.status}).` };
  } catch (err) {
    return { ok: false, error: err.message || "Could not reach Facebook." };
  }
}
