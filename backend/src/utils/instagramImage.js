// Instagram rejects images whose aspect ratio falls outside its accepted range
// (portrait 4:5 = 0.8 through landscape 1.91:1) with the Graph API error
// "The aspect ratio is not supported.". Our question cards are rendered at a
// VARIABLE height (short MCQ vs. a long stem with four table options), so a tall
// card easily drops below the 0.8 minimum. Facebook accepts any ratio, which is
// why the same post succeeds on Facebook but fails on Instagram.
//
// Rather than re-render the card, we ask Cloudinary (already in the pipeline) to
// PAD the delivered image onto a fixed 4:5 canvas. Padding never crops content —
// the whole card stays visible; only letterbox/pillarbox bars are added. 4:5 is
// chosen because it is the TALLEST portrait Instagram allows, giving the most
// room for tall cards before Cloudinary has to scale them down to fit.

// Cloudinary's tallest Instagram-safe portrait canvas.
export const IG_TARGET_WIDTH = 1080;
export const IG_TARGET_HEIGHT = 1350; // 1080x1350 = 4:5 = 0.8, IG's minimum ratio

// The transformation segment inserted into a Cloudinary delivery URL:
//  - c_pad          fit the whole image inside the box, padding the rest (no crop)
//  - w_/h_          the 4:5 target box
//  - b_white        fill the padding with white so it blends with the card
//  - fl_lossy,q_auto keep the padded PNG a reasonable size for the IG upload
const IG_PAD_TRANSFORM = `c_pad,w_${IG_TARGET_WIDTH},h_${IG_TARGET_HEIGHT},b_white,fl_lossy,q_auto`;

// Recognise a Cloudinary delivery URL and expose its `/upload/` split point.
// Cloudinary URLs look like:
//   https://res.cloudinary.com/<cloud>/image/upload/<transforms?>/v123/<public_id>.<fmt>
const CLOUDINARY_UPLOAD_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

// Detect a transformation segment we (or Cloudinary) already inserted, so we
// never stack a second c_pad on top of an existing one.
const HAS_TRANSFORM_RE = /(^|,)(c_|w_|h_|ar_|b_|fl_|q_|g_)/;

// Given ANY image URL, return a URL that Instagram will accept the aspect ratio
// of. For a Cloudinary URL we inject a pad-to-4:5 transform; for anything else
// we return the URL unchanged (the caller still tries to post it, and a genuine
// ratio failure is reported exactly as before — we only guarantee compliance
// for images we ourselves host on Cloudinary).
export function toInstagramSafeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return u;

  const m = CLOUDINARY_UPLOAD_RE.exec(u);
  if (!m) return u; // not a Cloudinary URL — leave it untouched

  const prefix = m[1]; // ".../image/upload/"
  let rest = m[2]; // "<transforms?>/v123/<public_id>.<fmt>"

  // If the FIRST path segment is already a transformation, replace it so we
  // don't double-pad (e.g. re-posting a URL that was already made IG-safe).
  const firstSlash = rest.indexOf("/");
  const firstSeg = firstSlash === -1 ? rest : rest.slice(0, firstSlash);
  if (HAS_TRANSFORM_RE.test(firstSeg)) {
    rest = firstSlash === -1 ? "" : rest.slice(firstSlash + 1);
  }

  return `${prefix}${IG_PAD_TRANSFORM}/${rest}`;
}

// True when a width/height (from a rendered card) is already inside Instagram's
// accepted aspect-ratio window, i.e. padding is unnecessary. Exposed for tests
// and any future callers that know the exact dimensions up front.
export function isInstagramAspectOk(width, height) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0)) return false;
  const ratio = w / h;
  // IG accepts 4:5 (0.8) portrait through 1.91:1 landscape. A tiny epsilon
  // avoids rejecting an image sitting exactly on the 0.8 boundary.
  return ratio >= 0.8 - 1e-6 && ratio <= 1.91 + 1e-6;
}
