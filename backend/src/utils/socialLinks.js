// The site's social links (Settings.socialLinks — the same list the footer
// shows) as a "Follow us" block for video descriptions and post comments. Pure.
const LABEL = {
  youtube: ["▶️", "YouTube"], facebook: ["📘", "Facebook"], instagram: ["📸", "Instagram"],
  telegram: ["✈️", "Telegram"], whatsapp: ["💬", "WhatsApp"], twitter: ["🐦", "X (Twitter)"],
  linkedin: ["💼", "LinkedIn"], website: ["🌐", "Website"], other: ["🔗", "Link"],
};
const ORDER = ["youtube", "facebook", "instagram", "telegram", "whatsapp", "twitter", "linkedin", "website", "other"];

// → [{ platform, url }] cleaned, deduped, in a fixed order. `exclude` drops a
// platform (e.g. no "Facebook" link in a Facebook comment).
export function socialLinkList(links = [], { exclude = [] } = {}) {
  const seen = new Set();
  return (Array.isArray(links) ? links : [])
    .map((l) => ({ platform: String(l?.platform || "other").toLowerCase(), url: String(l?.url || "").trim() }))
    .filter((l) => /^https?:\/\/\S+\.\S+/i.test(l.url) && !exclude.includes(l.platform))
    .filter((l) => (seen.has(l.url.toLowerCase()) ? false : seen.add(l.url.toLowerCase())))
    .sort((a, b) => (ORDER.indexOf(a.platform) + 99) % 99 - (ORDER.indexOf(b.platform) + 99) % 99);
}

export function formatSocialLinks(links = [], { heading = "📌 Follow us & practise more:", exclude = [], siteUrl = "" } = {}) {
  const list = socialLinkList(links, { exclude });
  if (siteUrl && !list.some((l) => l.platform === "website") && /^https?:\/\//i.test(siteUrl)) list.push({ platform: "website", url: siteUrl });
  if (!list.length) return "";
  const lines = list.map((l) => { const [icon, name] = LABEL[l.platform] || LABEL.other; return `${icon} ${name}: ${l.url}`; });
  return [heading, ...lines].join("\n");
}
