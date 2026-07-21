import Settings from "../models/Settings.js";
import { postToFacebookPage, verifyFacebook, getFacebookConfig, getInstagramUserId, postToInstagram } from "../config/facebook.js";
import { renderQuestionImage } from "../config/socialImage.js";

async function getOrCreate() {
  let s = await Settings.findOne({ key: "site" });
  if (!s) s = await Settings.create({ key: "site" });
  return s;
}

// Never send the Facebook access token to the browser. Replace it with a
// boolean (fbTokenSet) so the admin UI can show "saved" without exposing it.
function safeSettings(s) {
  const obj = s && s.toObject ? s.toObject() : { ...(s || {}) };
  obj.fbTokenSet = !!obj.fbPageAccessToken;
  delete obj.fbPageAccessToken;
  return obj;
}

// GET /api/settings — public (frontend reads this to brand/theme itself)
export async function getSettings(req, res) {
  res.json(safeSettings(await getOrCreate()));
}

// PUT /api/settings — admin only
export async function updateSettings(req, res) {
  const allowed = [
    "siteName", "tagline", "logoUrl", "primaryColor", "accentColor",
    "fontFamily", "socialLinks", "contacts",
    "navHeight", "navBrandSize", "navFontSize", "navFontWeight", "navFontFamily", "navTextTransform", "defaultZoom",
    "watermarkEnabled", "watermarkText", "watermarkOpacity", "watermarkSize", "watermarkMode", "restrictCopy", "screenshotGuard", "guardHoldMs", "statsAuto", "notifyOnNewContent",
    "homeSections",
    "aboutHeading", "aboutIntro", "aboutValues", "aboutStats",
    "aiMaxPerBatch", "clientPlans",
    "fbEnabled", "fbPageId", "fbAutoOnNotice", "fbGraphVersion", "fbPageAccessToken",
    "igEnabled", "igUserId",
  ];
  const update = {};
  for (const k of allowed) if (k in req.body) update[k] = req.body[k];

  // Facebook: keep the token server-side. Only overwrite it when a NEW non-empty
  // value is provided (the admin UI submits it blank to keep the saved one).
  if ("fbPageAccessToken" in update) {
    const tok = String(update.fbPageAccessToken || "").trim();
    if (tok) update.fbPageAccessToken = tok; else delete update.fbPageAccessToken;
  }
  if ("fbPageId" in update) update.fbPageId = String(update.fbPageId || "").trim();
  if ("fbGraphVersion" in update) update.fbGraphVersion = String(update.fbGraphVersion || "").trim() || "v21.0";
  if ("igUserId" in update) update.igUserId = String(update.igUserId || "").trim();

  // AI limits: clamp the admin's global per-batch ceiling.
  if ("aiMaxPerBatch" in update) {
    update.aiMaxPerBatch = Math.max(1, Math.min(5000, parseInt(update.aiMaxPerBatch, 10) || 50));
  }
  // Client subscription plans: pricing + AI limits. Keys are kept stable
  // (referenced by user.subscriptionPlan); a missing key is generated from the
  // label and de-duplicated so each plan stays uniquely addressable.
  if (Array.isArray(update.clientPlans)) {
    const usedKeys = new Set();
    update.clientPlans = update.clientPlans
      .map((p) => {
        const label = String(p?.label || "").trim();
        let base = String(p?.key || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
        if (!base) base = (label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "plan");
        let key = base;
        let i = 2;
        while (usedKeys.has(key)) key = `${base}${i++}`;
        usedKeys.add(key);
        return {
          key,
          label,
          cycle: String(p?.cycle || "").trim().slice(0, 30),
          months: Math.max(0, Math.min(120, parseInt(p?.months, 10) || 0)),
          price: Math.max(0, Math.min(10000000, parseInt(p?.price, 10) || 0)),
          trial: !!p?.trial,
          maxPerBatch: Math.max(1, Math.min(5000, parseInt(p?.maxPerBatch, 10) || 1)),
          perWindow: Math.max(1, Math.min(100000, parseInt(p?.perWindow, 10) || 1)),
          windowMinutes: Math.max(1, Math.min(1440, parseInt(p?.windowMinutes, 10) || 5)),
        };
      })
      .filter((p) => p.label);
  }

  // Make social links absolute so a link pasted without http:// still works.
  if (Array.isArray(update.socialLinks)) {
    update.socialLinks = update.socialLinks
      .filter((s) => s && s.url && s.url.trim() && s.url.trim() !== "#")
      .map((s) => {
        const u = s.url.trim();
        return { platform: s.platform, url: /^https?:\/\//i.test(u) ? u : `https://${u}` };
      });
  }

  const s = await Settings.findOneAndUpdate({ key: "site" }, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });
  res.json(safeSettings(s));
}

// POST /api/settings/facebook/test — admin: verify the connection and (unless
// verifyOnly) publish a test post to the configured Facebook Page.
export async function testFacebookPost(req, res) {
  const cfg = await getFacebookConfig();
  if (!cfg.pageId || !cfg.token) {
    return res.status(400).json({ ok: false, error: "Enter your Page ID and Page access token, click Save, then try again." });
  }
  if (req.body?.verifyOnly) {
    const v = await verifyFacebook(cfg);
    return res.status(v.ok ? 200 : 502).json(v);
  }
  const site = await getOrCreate();
  const message = String(req.body?.message || "").trim() ||
    `✅ Test post from ${site.siteName || "My Study Guide"} — Facebook auto-posting is connected.`;
  const result = await postToFacebookPage({ message, link: req.body?.link }, cfg);
  return res.status(result.ok ? 200 : 502).json(result);
}

// POST /api/settings/instagram/test — admin: verify the linked IG account and
// (unless verifyOnly) publish a test image post to Instagram.
export async function testInstagramPost(req, res) {
  const cfg = await getFacebookConfig();
  if (!cfg.pageId || !cfg.token) {
    return res.status(400).json({ ok: false, error: "Connect Facebook first (Page ID + token)." });
  }
  const igId = await getInstagramUserId(cfg);
  if (!igId) {
    return res.status(400).json({ ok: false, error: "No Instagram Business/Creator account is linked to this Facebook Page. Link it in your Facebook Page settings, then try again." });
  }
  if (req.body?.verifyOnly) return res.json({ ok: true, igUserId: igId });

  const site = await getOrCreate();
  const title = `Test post from ${site.siteName || "My Study Guide"}`;
  const imageUrl = await renderQuestionImage(
    { text: title, options: ["Ready", "Set", "Go", "Posted!"], correct: 3 },
    { includeOptions: true }
  );
  if (!imageUrl) return res.status(502).json({ ok: false, error: "Could not generate the image (check Cloudinary keys in the server settings)." });
  const result = await postToInstagram({ imageUrl, caption: `${title} — Instagram auto-posting is connected. ✅` }, cfg);
  return res.status(result.ok ? 200 : 502).json(result);
}
