import Settings from "../models/Settings.js";

async function getOrCreate() {
  let s = await Settings.findOne({ key: "site" });
  if (!s) s = await Settings.create({ key: "site" });
  return s;
}

// GET /api/settings — public (frontend reads this to brand/theme itself)
export async function getSettings(req, res) {
  res.json(await getOrCreate());
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
  ];
  const update = {};
  for (const k of allowed) if (k in req.body) update[k] = req.body[k];

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
  res.json(s);
}
