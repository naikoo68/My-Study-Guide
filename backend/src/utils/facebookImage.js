// Facebook's mobile feed displays a single PHOTO inside a PORTRAIT-ish window
// and center-crops anything that doesn't fit that window to FILL it. Our question
// cards render at a VARIABLE height (config/cardShot.js screenshots the real
// /q-card page, whose height grows with the content):
//
//   • Statement / matching / assertion cards carry extra boxes (a statements
//     list or two columns), so they render TALL/PORTRAIT and sit inside the feed
//     window — Facebook shows them in FULL.
//   • A PLAIN MCQ is just a stem + four short options, so it renders SHORT and
//     WIDE (landscape / near-square). That card is WIDER than the feed window, so
//     Facebook crops the SIDES to fill it — the option letters (A/B/C/D) and the
//     first few characters of every line get cut off on the LEFT/RIGHT.
//
// Unlike Instagram (which REJECTS out-of-range images with an API error),
// Facebook happily ACCEPTS any ratio — it just crops it on DISPLAY. So the post
// succeeds but the plain-MCQ card looks clipped in the feed.
//
// Fix: before handing the (Cloudinary-hosted) image to Facebook, pad a wide /
// short card up to a PORTRAIT canvas so it matches the tall cards Facebook
// already shows in full. Padding NEVER crops — the whole card stays visible —
// and because the card background is white the bars blend in. Cards that are
// already portrait/square are left completely untouched.

// Widest aspect ratio (width / height) Facebook's mobile feed shows without
// cropping the sides. Anything wider than this is a landscape/short card that
// gets side-cropped, so we pad it. Square (1.0) and portrait cards are safe.
export const FB_MAX_AR = 1.0;

// The portrait canvas we pad a too-wide card onto (4:5 = 0.8) — the same tall
// shape as the statement/matching cards Facebook already displays in full, and
// Facebook's own recommended feed ratio. `b_white` fills the bars to match the
// card background so they're invisible on the white card.
//
// SYNTAX (verified against Cloudinary — see utils/instagramImage.js): the
// `if_<condition>` MUST be its OWN `/`-separated URL component. Comma-joining it
// with the guarded transform (`if_ar_gt_1.0,c_pad,…`) makes Cloudinary return
// HTTP 400 (an error page, not an image) and Facebook then fails to fetch it.
const FB_CONDITIONAL_TRANSFORM = `if_ar_gt_1.0/c_pad,ar_4:5,b_white/if_end`;

// Recognise a Cloudinary delivery URL and split it at `/upload/`.
//   https://res.cloudinary.com/<cloud>/image/upload/<transforms?>/v123/<public_id>.<fmt>
const CLOUDINARY_UPLOAD_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

// Given ANY image URL, return one whose aspect ratio Facebook's feed shows in
// FULL. For a Cloudinary URL we inject the CONDITIONAL pad transform (a no-op
// for portrait/square cards, which deliver at their exact size). Non-Cloudinary
// URLs and already-processed URLs are returned unchanged.
export function toFacebookSafeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return u;

  const m = CLOUDINARY_UPLOAD_RE.exec(u);
  if (!m) return u; // not a Cloudinary URL — leave it untouched

  // Idempotent: if we already inserted our transform, don't stack another one.
  if (u.includes("if_ar_gt_1.0")) return u;

  return `${m[1]}${FB_CONDITIONAL_TRANSFORM}/${m[2]}`;
}

// True when a width/height is already inside Facebook's fully-shown window (i.e.
// no padding is needed — the card is square or portrait). Exposed for tests and
// any future caller that knows the exact dimensions up front.
export function isFacebookAspectOk(width, height) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0)) return false;
  // A tiny epsilon avoids padding an image sitting exactly on the square boundary.
  return w / h <= FB_MAX_AR + 1e-6;
}
