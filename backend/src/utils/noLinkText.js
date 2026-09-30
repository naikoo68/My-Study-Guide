// Text for platforms that NEVER make links tappable: Instagram (captions,
// Reel descriptions, comments) and YouTube Shorts (comments & descriptions,
// since Aug 2023). A raw `https://…` there is just grey, untappable text, so we
// rewrite it into something a viewer can act on: a short, typeable domain plus
// a "link in bio" call to action. Pure — unit-tested without any network.

export const DEFAULT_LINK_IN_BIO = "🔗 Link in bio";

// @everyone / @followers / @all / @here / @highlight don't notify anyone on
// Instagram or YouTube (apps can't "tag all followers"). Instagram even renders
// them as blue @-mentions of unrelated accounts, so they're pure clutter there.
// The lookbehind keeps emails / handles like "a@all.com" or "@@all" intact;
// leading spaces are eaten so "Follow us @everyone!" → "Follow us!".
const NOTIFY_ALL_RE = /[ \t]*(?<![\w@.])@(?:everyone|followers|all|here|highlight)\b(?![\w.]*\w)/gi;

export function stripNotifyAll(text) {
  return String(text ?? "")
    .replace(NOTIFY_ALL_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// True when the text is ONLY notify-all tokens (e.g. a comment "@followers").
export function isNotifyAllOnly(text) {
  const t = String(text ?? "").trim();
  return !!t && !stripNotifyAll(t).replace(/[\s,.;:!?]+/g, "");
}

// "https://www.mystudyguide.in/" → "mystudyguide.in". Trailing sentence
// punctuation stays outside the URL ("…mystudyguide.in." keeps its full stop).
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
// Share-button tracking codes (YouTube ?si=, Facebook ?mibextid=, utm_…) —
// they only make an untappable line long and messy, so they're dropped.
const TRACKING_PARAM = /^(?:si|feature|mibextid|fbclid|igshid|igsh|gclid|ref_src|rdid|share_id|utm_[a-z_]+)$/i;
function dropTracking(core) {
  const q = core.indexOf("?");
  if (q === -1) return core;
  const [query, hash = ""] = core.slice(q + 1).split("#");
  const kept = query.split("&").filter((kv) => kv && !TRACKING_PARAM.test(kv.split("=")[0]));
  return core.slice(0, q) + (kept.length ? `?${kept.join("&")}` : "") + (hash ? `#${hash}` : "");
}
// Instagram turns any "@name" into a mention of an INSTAGRAM account — so
// "youtube.com/@mystudyguide786" linked to whoever owns that name on Instagram.
// A zero-width space after "@" keeps it looking the same but not a mention.
const NO_MENTION = "@\u200B";
function bareUrl(url) {
  const m = String(url).match(/^(.*?)([.,;:!?]*)$/);
  const core = m ? m[1] : String(url);
  const tail = m ? m[2] : "";
  const bare = dropTracking(core)
    .replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/^m\./i, "")
    .replace(/\/+(?=$|\?|#)/, "")
    .replace(/@/g, NO_MENTION);
  return bare + tail;
}

// Rewrite links for a no-link platform. When at least one URL was found, the
// CTA is added once (skipped if the text already says "link in bio"). If the
// text ends with a hashtag-only paragraph, the CTA goes just before it so the
// hashtags stay last.
export function toNoLinkText(text, { cta = DEFAULT_LINK_IN_BIO } = {}) {
  const src = String(text ?? "");
  let found = false;
  const out = src.replace(URL_RE, (u) => { found = true; return bareUrl(u); });
  const call = String(cta ?? "").trim();
  if (!found || !call || /link\s+in\s+(?:the\s+|our\s+)?bio/i.test(out) || out.includes(call)) return out;
  const paras = out.replace(/\s+$/, "").split(/\n{2,}/);
  const last = paras[paras.length - 1] || "";
  if (paras.length > 1 && /^(?:\s*#[^\s#]+)+\s*$/.test(last)) {
    paras.splice(paras.length - 1, 0, call);
    return paras.join("\n\n");
  }
  return `${out.replace(/\s+$/, "")}\n${call}`;
}

// Everything a comment on Instagram / a YouTube Short needs: drop the
// notify-all tokens, then rewrite the links. "" means "nothing worth posting".
export function forNoLinkComment(text, opts = {}) {
  return toNoLinkText(stripNotifyAll(text), opts).trim();
}
