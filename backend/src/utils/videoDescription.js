// "Text for every video description" — the admin's own lines (e.g. a
// disclaimer, a Telegram / WhatsApp invite, "Download our app…") added to the
// description of EVERY video: YouTube long videos + Shorts, and Facebook
// videos + Reels. Each account (main or cross-posting user) has its own text,
// and it can be switched off per platform. Pure (tested).

export const MAX_VIDEO_TEXT = 1500;

export function cleanVideoText(v) {
  return String(v ?? "").replace(/\r\n?/g, "\n").replace(/[<>]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_VIDEO_TEXT);
}

// The text to add on `platform` ("youtube" | "facebook"), or "".
export function customVideoText(site, platform) {
  const text = cleanVideoText(site?.videoDescriptionText);
  if (!text) return "";
  if (platform === "youtube" && site?.videoDescriptionYoutube === false) return "";
  if (platform === "facebook" && site?.videoDescriptionFacebook === false) return "";
  return text;
}

// Add `text` to a description: above a final hashtags-only paragraph (so the
// hashtags stay last, where YouTube shows them), else at the end. `max` is
// the platform's limit; the existing description is shortened first, so the
// admin's text is never cut off.
export function withVideoText(description, text, max = 5000) {
  const desc = String(description || "").trim();
  const add = String(text || "").trim();
  if (!add) return desc;
  if (desc.includes(add)) return desc; // never twice
  const parts = desc ? desc.split(/\n\n/) : [];
  const last = parts[parts.length - 1] || "";
  const tagsLast = parts.length > 1 && /^(\s*#[\p{L}\p{M}\p{N}_]+)+\s*$/u.test(last);
  const build = (d) => {
    const p = d ? d.split(/\n\n/) : [];
    if (tagsLast && p.length > 1) return [...p.slice(0, -1), add, p[p.length - 1]].join("\n\n");
    return [d, add].filter(Boolean).join("\n\n");
  };
  let out = build(desc);
  if (Buffer.byteLength(out, "utf8") <= max) return out;
  // Too long: shorten the body (keep the hashtags line and the admin's text).
  let body = tagsLast ? parts.slice(0, -1).join("\n\n") : desc;
  const tail = tagsLast ? `\n\n${add}\n\n${last}` : `\n\n${add}`;
  while (body && Buffer.byteLength(body + tail, "utf8") > max) body = body.slice(0, -50).trimEnd();
  out = body ? body + tail : tail.trim();
  while (Buffer.byteLength(out, "utf8") > max) out = out.slice(0, -50);
  return out;
}
