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
    "aboutHeading", "aboutIntro", "aboutValues", "aboutStats",
  ];
  const update = {};
  for (const k of allowed) if (k in req.body) update[k] = req.body[k];

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
