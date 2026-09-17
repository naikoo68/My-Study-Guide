// Instagram rejects images whose aspect ratio is outside its accepted range
// (portrait 4:5 = 0.8 through landscape 1.91:1) with the Graph API error
// "The aspect ratio is not supported.". Our question cards render at a VARIABLE
// height, so an unusually TALL card can drop below the 0.8 minimum. Facebook
// accepts any ratio, which is why the same post can succeed on Facebook yet
// fail on Instagram.
//
// IMPORTANT: most cards already sit inside the accepted range, so they must be
// posted EXACTLY as-is — identical to the quiz card, with no letterbox bars.
// Only the rare out-of-range card needs adjusting. We therefore use Cloudinary
// CONDITIONAL transformations: pad ONLY when the card is too tall (or, very
// rarely, too wide), and leave every in-range card completely untouched.
// Padding never crops — the whole card stays visible — and because the card has
// a white background the minimal bars blend in.

// Instagram's accepted aspect-ratio bounds (width / height).
export const IG_MIN_AR = 0.8; // 4:5 portrait — the tallest IG allows
export const IG_MAX_AR = 1.91; // 1.91:1 landscape — the widest IG allows

// Instagram's Content Publishing API only reliably accepts JPEG images — a PNG
// (what our card renderer uploads) is rejected with "Only photo or video can be
// accepted as media type.". So we ALWAYS force JPEG delivery for Instagram via
// Cloudinary's `f_jpg`. `fl_lossy,q_auto` keeps the JPEG a sensible size. This
// is applied unconditionally (it's the first transform component); the card
// looks identical — only the delivered file format changes.
const IG_FORMAT_TRANSFORM = `f_jpg,fl_lossy,q_auto`;

// Cloudinary conditional transform (runs AFTER the format component):
//   if the image is TALLER than 4:5  -> pad (add side bars) up to 4:5
//   else if it is WIDER than 1.91:1  -> pad (add top/bottom bars) down to 1.91
//   otherwise                        -> NO padding, deliver the exact card
// Each `if_…` block is closed by `if_end`; the two conditions are mutually
// exclusive, so at most one pad is ever applied. `b_white` fills the (minimal)
// padding to match the card background.
//
// SYNTAX: the `if_<condition>` MUST be its OWN URL component (separated by `/`)
// — NOT comma-joined with the transform it guards. Writing
// `if_ar_lt_0.8,c_pad,…` makes Cloudinary return HTTP 400 (an error page, not
// an image), and Instagram then fails to fetch it with the misleading error
// "Only photo or video can be accepted as media type." (subcode 2207052 =
// "media download has failed"). Verified against Cloudinary: the `/`-separated
// form below returns a valid JPEG and pads exactly as intended.
const IG_CONDITIONAL_TRANSFORM =
  `if_ar_lt_0.8/c_pad,ar_4:5,b_white/if_end/` +
  `if_ar_gt_1.91/c_pad,ar_1.91,b_white/if_end`;

// Full transform chain injected for Instagram: force JPEG, then pad only if the
// aspect ratio is out of range.
const IG_TRANSFORM = `${IG_FORMAT_TRANSFORM}/${IG_CONDITIONAL_TRANSFORM}`;

// Recognise a Cloudinary delivery URL and split it at `/upload/`.
//   https://res.cloudinary.com/<cloud>/image/upload/<transforms?>/v123/<public_id>.<fmt>
const CLOUDINARY_UPLOAD_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

// Given ANY image URL, return one whose aspect ratio Instagram will accept.
// For a Cloudinary URL we inject the CONDITIONAL pad transform (a no-op for
// in-range cards, so they deliver at their exact size). Non-Cloudinary URLs and
// already-processed URLs are returned unchanged.
export function toInstagramSafeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return u;

  const m = CLOUDINARY_UPLOAD_RE.exec(u);
  if (!m) return u; // not a Cloudinary URL — leave it untouched

  // Idempotent: if we already inserted our transform, don't stack another one
  // (e.g. if a made-safe URL is passed back in).
  if (u.includes("f_jpg") || u.includes("if_ar_lt_0.8")) return u;

  return `${m[1]}${IG_TRANSFORM}/${m[2]}`;
}

// True when a width/height is already inside Instagram's accepted aspect-ratio
// window (i.e. no padding is needed). Exposed for tests and any future caller
// that knows the exact dimensions up front.
export function isInstagramAspectOk(width, height) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0)) return false;
  const ratio = w / h;
  // A tiny epsilon avoids rejecting an image sitting exactly on a boundary.
  return ratio >= IG_MIN_AR - 1e-6 && ratio <= IG_MAX_AR + 1e-6;
}
