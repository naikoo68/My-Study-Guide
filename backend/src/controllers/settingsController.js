import Settings from "../models/Settings.js";
import Tenant from "../models/Tenant.js";
import { getCurrentTenantId } from "../utils/tenantContext.js";
import { postToFacebookPage, verifyFacebook, getFacebookConfig, getInstagramUserId, postToInstagram } from "../config/facebook.js";
import { renderQuestionImage } from "../config/socialImage.js";
import { uploadToCloudinary } from "../config/cloudinary.js";

// A freshly-provisioned institute must start as a CLEAN SLATE — it should carry
// only its own name, never the platform's demo branding, marketing copy, fake
// testimonials/stats or contact details. We pass these fields explicitly (empty)
// so Mongoose does NOT fall back to the schema defaults ("My Study Guide", the
// sample toppers, "1,20,000+ students", hello@mystudyguide.com, …). Functional
// defaults (colours, nav sizing, watermark, subscription plans) are left to the
// schema so the institute still has sensible, working settings.
export function cleanTenantSeed(instituteName) {
  return {
    key: "site",
    siteName: instituteName || "",
    tagline: "",
    aboutHeading: "",
    aboutIntro: "",
    aboutValues: [],
    aboutStats: [],
    testimonials: [],
    contacts: [],
    socialLinks: [],
  };
}

// Fetch this scope's settings, creating the doc on first access. For a NON-default
// institute the new doc is seeded empty (its own name only); the default/platform
// tenant keeps the full demo defaults so nothing about the main site changes.
// Resolve THIS site's settings document DETERMINISTICALLY. A multi-tenant setup
// (and non-Mongo engines where query auto-scoping doesn't run) can hold several
// {key:"site"} docs. A bare `findOne({key:"site"})` returns an ARBITRARY one —
// which is exactly why on Oracle the public site picked up a different
// institute's (near-empty) settings, so branding, social links, contacts,
// platform statistics and the home layout all went missing. Here we pick the
// right doc explicitly: current tenant → default tenant → tenant-less → any.
async function findSite() {
  const tenantId = getCurrentTenantId();
  if (tenantId) {
    const s = await Settings.findOne({ key: "site", tenantId });
    if (s) return s;
  }
  const def = await Tenant.findOne({ isDefault: true }).select("_id").lean();
  if (def) {
    const s = await Settings.findOne({ key: "site", tenantId: def._id });
    if (s) return s;
  }
  const legacy = await Settings.findOne({ key: "site", tenantId: null });
  if (legacy) return legacy;
  return Settings.findOne({ key: "site" });
}

async function getOrCreate() {
  const existing = await findSite();
  if (existing) return existing;
  const tenantId = getCurrentTenantId();
  if (tenantId) {
    const t = await Tenant.findById(tenantId).select("name isDefault").lean();
    if (t && !t.isDefault) return Settings.create(cleanTenantSeed(t.name));
  }
  return Settings.create({ key: "site" });
}

// The settings doc that WRITES must target: strictly the CURRENT tenant's OWN
// doc. findSite()/getOrCreate() fall back to the default/legacy doc for READS
// (so a public visitor still sees platform branding), but a write must never
// land on — or be scoped away from — another tenant's doc.
//
// Why this matters: PUT /settings used to capture getOrCreate() (which could
// return the DEFAULT tenant's doc for an institute with no doc yet) and then
// findByIdAndUpdate(that._id, …). The tenantId plugin forces tenantId=current
// on writes, so the _id matched but the tenant didn't → the update silently
// hit 0 rows and was LOST. That's why an institute admin's onboardingCompleted
// (and other saves) never stuck and the setup wizard kept returning. We now
// resolve/create the caller's OWN doc and save() it, which the plugin stamps to
// the right tenant instead of filtering away.
async function getOrCreateOwn() {
  const tenantId = getCurrentTenantId();
  if (tenantId) {
    const mine = await Settings.findOne({ key: "site", tenantId });
    if (mine) return mine;
    const t = await Tenant.findById(tenantId).select("name isDefault").lean();
    // A real institute starts from a clean seed; the platform/default tenant
    // keeps the full schema defaults.
    return Settings.create(t && !t.isDefault ? cleanTenantSeed(t.name) : { key: "site" });
  }
  // No tenant context (super-admin unscoped / single-tenant): use the normal
  // resolver, creating a default doc if needed.
  return getOrCreate();
}

// Never send the Facebook access token to the browser. Replace it with a
// boolean (fbTokenSet) so the admin UI can show "saved" without exposing it.
function safeSettings(s) {
  const obj = s && s.toObject ? s.toObject() : { ...(s || {}) };
  obj.fbTokenSet = !!obj.fbPageAccessToken;
  delete obj.fbPageAccessToken;
  // Extra cross-post pages: never send their tokens to the browser.
  if (Array.isArray(obj.fbExtraTargets)) {
    obj.fbExtraTargets = obj.fbExtraTargets.map((t) => ({ label: t.label || "", pageId: t.pageId || "", tokenSet: !!t.token }));
  }
  return obj;
}

// GET /api/settings — public (frontend reads this to brand/theme itself)
export async function getSettings(req, res) {
  const s = safeSettings(await getOrCreate());
  // Tell the frontend whether this is the platform (default) site or an
  // institute's own site. Used to hide the "Institute" sign-up/login option on
  // an institute site (registering a NEW institute belongs only on the platform
  // site; Student and Creator still belong on an institute site).
  s.isDefaultTenant = !req.tenant || req.tenant.isDefault === true;
  // The platform root domain (when subdomains are configured), so the frontend
  // can build clean per-institute URLs (slug.rootDomain) instead of ?t=slug.
  s.rootDomain = (process.env.ROOT_DOMAIN || "").replace(/^\./, "").toLowerCase();
  res.json(s);
}

// PUT /api/settings — admin only
export async function updateSettings(req, res) {
  // Resolve THIS caller's OWN settings doc (created clean-seeded if it doesn't
  // exist yet). Using getOrCreateOwn — NOT getOrCreate — is what makes an
  // institute admin's save land on their own doc instead of silently hitting 0
  // rows on the default tenant's doc (see getOrCreateOwn's note).
  const site = await getOrCreateOwn();

  const allowed = [
    "siteName", "tagline", "logoUrl", "primaryColor", "accentColor",
    "heroBadge", "heroTitle", "heroSubtitle",
    "fontFamily", "socialLinks", "contacts",
    "navHeight", "navBrandSize", "navFontSize", "navFontWeight", "navFontFamily", "navTextTransform", "defaultZoom",
    "watermarkEnabled", "watermarkText", "watermarkOpacity", "watermarkSize", "watermarkMode", "restrictCopy", "screenshotGuard", "guardHoldMs", "statsAuto", "notifyOnNewContent",
    "publicClientEnabled", "publicInstituteEnabled",
    "studentPlansEnabled", "creatorPlansEnabled", "institutePlansEnabled",
    "featureFlags", "publicFeatureFlags",
    "homeSections",
    "clientAnnouncement",
    "onboardingCompleted", "onboardingDismissed",
    "privacyPolicy", "termsOfService", "refundPolicy",
    "aboutHeading", "aboutIntro", "aboutValues", "aboutStats", "testimonials", "faqs",
    "aiMaxPerBatch", "clientPlans", "studentPlans", "tenantPlans",
    "fbEnabled", "fbPageId", "fbAutoOnNotice", "fbGraphVersion", "fbPageAccessToken",
    "fbDefaultHashtags", "fbAutoHashtags", "fbExtraTargets",
    "fbSelfieWatermarkUrl", "fbSelfieWatermarkEnabled", "fbSelfieWatermarkPosition", "fbSelfieWatermarkSize", "fbSelfieWatermarkOpacity", "fbSelfieWatermarkShape",
    "igEnabled", "igUserId",
    "googleClientId",
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
  // Extra cross-post Pages: keep each page's saved token when the UI submits a
  // blank one (tokens are never sent to the browser, so blank = "unchanged").
  if (Array.isArray(update.fbExtraTargets)) {
    const savedTokens = new Map((site.fbExtraTargets || []).map((t) => [String(t.pageId), t.token]));
    update.fbExtraTargets = update.fbExtraTargets
      .map((t) => {
        const pageId = String(t?.pageId || "").trim();
        const token = String(t?.token || "").trim() || savedTokens.get(pageId) || "";
        return { label: String(t?.label || "").trim(), pageId, token };
      })
      .filter((t) => t.pageId);
  }
  if ("fbGraphVersion" in update) update.fbGraphVersion = String(update.fbGraphVersion || "").trim() || "v21.0";
  if ("igUserId" in update) update.igUserId = String(update.igUserId || "").trim();
  if ("googleClientId" in update) update.googleClientId = String(update.googleClientId || "").trim();

  // Selfie watermark: validate position and clamp size/opacity.
  if ("fbSelfieWatermarkUrl" in update) update.fbSelfieWatermarkUrl = String(update.fbSelfieWatermarkUrl || "").trim();
  if ("fbSelfieWatermarkPosition" in update) {
    const pos = String(update.fbSelfieWatermarkPosition || "").trim();
    update.fbSelfieWatermarkPosition = ["bottom-right", "bottom-left", "top-right", "top-left"].includes(pos) ? pos : "bottom-right";
  }
  if ("fbSelfieWatermarkSize" in update) update.fbSelfieWatermarkSize = Math.max(40, Math.min(300, parseInt(update.fbSelfieWatermarkSize, 10) || 120));
  if ("fbSelfieWatermarkOpacity" in update) update.fbSelfieWatermarkOpacity = Math.max(10, Math.min(100, parseInt(update.fbSelfieWatermarkOpacity, 10) || 90));
  if ("fbSelfieWatermarkShape" in update) {
    const sh = String(update.fbSelfieWatermarkShape || "").trim();
    update.fbSelfieWatermarkShape = ["circle", "rectangle"].includes(sh) ? sh : "circle";
  }

  // Admin-panel feature switches. Accept a flat { key: boolean } map, coerce
  // every value to a real boolean, and NEVER allow the core always-on features
  // to be turned off (even if the client sends them as false).
  if ("featureFlags" in update) {
    const ALWAYS_ON = new Set(["users", "aiKeys", "storage", "customization"]);
    const raw = update.featureFlags && typeof update.featureFlags === "object" ? update.featureFlags : {};
    const clean = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k).trim();
      if (!key || ALWAYS_ON.has(key)) continue;
      clean[key] = !!v;
    }
    update.featureFlags = clean;
  }

  // Public-site feature switches — same shape, coerced to booleans. (No always-on
  // exclusions: these only affect what's shown on the public website.)
  if ("publicFeatureFlags" in update) {
    const raw = update.publicFeatureFlags && typeof update.publicFeatureFlags === "object" ? update.publicFeatureFlags : {};
    const clean = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k).trim();
      if (!key) continue;
      clean[key] = !!v;
    }
    update.publicFeatureFlags = clean;
  }

  // Client welcome popup announcement: coerce enabled + trim/limit text.
  if ("clientAnnouncement" in update) {
    const a = update.clientAnnouncement || {};
    update.clientAnnouncement = {
      enabled: !!a.enabled,
      title: String(a.title || "").trim().slice(0, 200),
      message: String(a.message || "").trim().slice(0, 4000),
    };
  }

  // FAQ page content (per audience). Keep only {q,a} strings, trim + cap length,
  // drop fully-empty rows, and cap the number of questions per audience. An
  // audience left empty means the front end uses its built-in default FAQs.
  if ("faqs" in update) {
    const cleanFaqs = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .map((f) => ({ q: String(f?.q || "").trim().slice(0, 300), a: String(f?.a || "").trim().slice(0, 4000) }))
        .filter((f) => f.q || f.a)
        .slice(0, 50);
    const f = update.faqs || {};
    update.faqs = { student: cleanFaqs(f.student), creator: cleanFaqs(f.creator), institute: cleanFaqs(f.institute) };
  }

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
          days: Math.max(0, Math.min(3650, parseInt(p?.days, 10) || 0)),
          price: Math.max(0, Math.min(10000000, parseInt(p?.price, 10) || 0)),
          trial: !!p?.trial,
          maxPerBatch: Math.max(1, Math.min(5000, parseInt(p?.maxPerBatch, 10) || 1)),
          perWindow: Math.max(1, Math.min(100000, parseInt(p?.perWindow, 10) || 1)),
          windowMinutes: Math.max(1, Math.min(1440, parseInt(p?.windowMinutes, 10) || 5)),
        };
      })
      .filter((p) => p.label);
  }

  // Pricing-only plan lists (no AI limits): student + institute plans share the
  // same normalization — stable/de-duplicated keys, clamped numbers.
  const normalizePricingPlans = (plans) => {
    const usedKeys = new Set();
    return plans
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
          days: Math.max(0, Math.min(3650, parseInt(p?.days, 10) || 0)),
          price: Math.max(0, Math.min(10000000, parseInt(p?.price, 10) || 0)),
          trial: !!p?.trial,
        };
      })
      .filter((p) => p.label);
  };
  if (Array.isArray(update.studentPlans)) update.studentPlans = normalizePricingPlans(update.studentPlans);
  if (Array.isArray(update.tenantPlans)) update.tenantPlans = normalizePricingPlans(update.tenantPlans);

  // Make social links absolute so a link pasted without http:// still works.
  if (Array.isArray(update.socialLinks)) {
    update.socialLinks = update.socialLinks
      .filter((s) => s && s.url && s.url.trim() && s.url.trim() !== "#")
      .map((s) => {
        const u = s.url.trim();
        return { platform: s.platform, url: /^https?:\/\//i.test(u) ? u : `https://${u}` };
      });
  }

  // Write via the resolved document itself (site is the CURRENT tenant's own
  // doc). Using .save() means the tenantId plugin keeps/stamps the correct
  // tenant, instead of a findByIdAndUpdate whose write-scoping could filter the
  // row out and silently drop the update (the bug that stopped saves sticking).
  site.set(update);
  const s = await site.save();
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
  const rendered = await renderQuestionImage(
    { text: title, options: ["Ready", "Set", "Go", "Posted!"], correct: 3 },
    { includeOptions: true }
  );
  if (!rendered.url) return res.status(502).json({ ok: false, error: rendered.error || "Could not generate the image." });
  const result = await postToInstagram({ imageUrl: rendered.url, caption: `${title} — Instagram auto-posting is connected. ✅` }, cfg);
  return res.status(result.ok ? 200 : 502).json(result);
}

// POST /api/settings/selfie-watermark — admin: upload a selfie image to be used
// as a watermark on Facebook/Instagram image posts. Accepts multipart (file) or
// a base64 data URI in the body. Stores the Cloudinary URL in Settings.
export async function uploadSelfieWatermark(req, res) {
  try {
    let fileStr = null;

    // If multer attached a file (multipart upload), convert it to a base64 data URI.
    if (req.file) {
      const mime = req.file.mimetype || "image/png";
      fileStr = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
    } else if (req.body?.image) {
      // Base64 data URI sent directly in the body (from frontend FileReader).
      fileStr = String(req.body.image);
    }

    if (!fileStr) {
      return res.status(400).json({ ok: false, error: "No image provided. Upload a file or send a base64 image." });
    }

    const { url } = await uploadToCloudinary(fileStr, "mystudyguide/watermarks");
    if (!url) return res.status(502).json({ ok: false, error: "Cloudinary upload failed." });

    // Save the URL to THIS site's settings doc.
    const site = await getOrCreate();
    const s = await Settings.findByIdAndUpdate(site._id, { fbSelfieWatermarkUrl: url }, { new: true });
    res.json({ ok: true, url, settings: safeSettings(s) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "Upload failed." });
  }
}

// DELETE /api/settings/selfie-watermark — admin: remove the selfie watermark.
export async function deleteSelfieWatermark(req, res) {
  const site = await getOrCreate();
  const s = await Settings.findByIdAndUpdate(site._id, { fbSelfieWatermarkUrl: "" }, { new: true });
  res.json({ ok: true, settings: safeSettings(s) });
}
