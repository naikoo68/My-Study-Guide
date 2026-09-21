// Facebook's feed only shows a single PHOTO in FULL when its aspect ratio
// (width / height) is within the supported range — up to 1.91:1 on the WIDE
// side. A card that is WIDER than 1.91:1 gets cropped on the sides in the feed
// (the option letters A/B/C/D and the first characters of each line are cut off).
//
// Our question cards render at a VARIABLE height (config/cardShot.js screenshots
// the real /q-card page, whose height grows with content). Most cards —
// statements, matching, and even normal MCQs — are already within range and
// must be posted EXACTLY as-is. Only a very SHORT/WIDE card (e.g. a plain MCQ
// with a one-line stem and four short options) can exceed 1.91:1.
//
// Unlike Instagram (which REJECTS out-of-range images with an API error),
// Facebook ACCEPTS any ratio — it just crops on DISPLAY. So the post succeeds
// but an ultra-wide card looks clipped in the feed.
//
// Fix: pad a too-wide card DOWN to exactly 1.91:1 with white bars, so Facebook
// shows it in full. We pad only the tiny amount needed to reach 1.91:1 — NOT a
// tall portrait canvas — so there are no big empty margins. Padding never crops,
// the card background is white so the sliver blends in, and any card already
// within range is left completely untouched.

// Widest aspect ratio (width / height) Facebook's feed shows without cropping.
// Cards wider than this get padded down to it; everything else is untouched.
export const FB_MAX_AR = 1.91; // 1.91:1 — Facebook's widest supported ratio

// Cloudinary conditional transform: pad ONLY when the card is WIDER than 1.91:1,
// down to a 1.91:1 canvas (`b_white` fills the small bars to match the white
// card). Otherwise the exact card is delivered.
//
// SYNTAX (verified against Cloudinary — see utils/instagramImage.js): the
// `if_<condition>` MUST be its OWN `/`-separated URL component. Comma-joining it
// with the guarded transform (`if_ar_gt_1.91,c_pad,…`) makes Cloudinary return
// HTTP 400 (an error page, not an image) and Facebook then fails to fetch it.
const FB_CONDITIONAL_TRANSFORM = `if_ar_gt_1.91/c_pad,ar_1.91,b_white/if_end`;

// Cap the delivered width at 1440 px. Our card renderer produces 2×-density
// PNGs (question card ~2080×2800, flashcard ~3200×2240) that occasionally
// trigger Meta's transcoder to fail with subcode 2207076 ("Media upload has
// failed"). `c_limit` never upscales, only downscales in proportion, so smaller
// cards deliver unchanged. `q_auto:eco` keeps the file size well under Meta's
// 8 MB limit without a visible quality change.
const FB_SIZE_TRANSFORM = `c_limit,w_1440/q_auto:eco`;

// Full transform chain for a Facebook feed image: cap width and optimise
// quality first, then pad only if the card is wider than 1.91:1.
const FB_TRANSFORM = `${FB_SIZE_TRANSFORM}/${FB_CONDITIONAL_TRANSFORM}`;

// Recognise a Cloudinary delivery URL and split it at `/upload/`.
//   https://res.cloudinary.com/<cloud>/image/upload/<transforms?>/v123/<public_id>.<fmt>
const CLOUDINARY_UPLOAD_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

// Given ANY image URL, return one whose aspect ratio Facebook's feed shows in
// FULL. For a Cloudinary URL we inject the CONDITIONAL pad transform (a no-op
// for any card already within range, which delivers at its exact size).
// Non-Cloudinary URLs and already-processed URLs are returned unchanged.
export function toFacebookSafeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return u;

  const m = CLOUDINARY_UPLOAD_RE.exec(u);
  if (!m) return u; // not a Cloudinary URL — leave it untouched

  // Idempotent: if we already inserted our transform, don't stack another one.
  if (u.includes("if_ar_gt_1.91") || u.includes("c_limit,w_1440")) return u;

  return `${m[1]}${FB_TRANSFORM}/${m[2]}`;
}

// True when a width/height is already inside Facebook's fully-shown window (i.e.
// no padding is needed — the card is not wider than 1.91:1). Exposed for tests
// and any future caller that knows the exact dimensions up front.
export function isFacebookAspectOk(width, height) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0)) return false;
  // A tiny epsilon avoids padding an image sitting exactly on the boundary.
  return w / h <= FB_MAX_AR + 1e-6;
}
