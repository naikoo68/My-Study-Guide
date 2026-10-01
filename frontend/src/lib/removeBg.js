// Remove a PLAIN background (white / one colour) from an image, in the browser.
//
// How: the background colour is read from the image's border, then a flood
// fill starts from every border pixel and spreads only through CONNECTED
// pixels close to that colour. So the white eyes / teeth inside an emoji are
// kept — they aren't connected to the outside — while the white around it goes.
// Pixels slightly different from the background (anti-aliased edges) become
// partly transparent (`feather`), so there's no white fringe.
//
// Works on plain backgrounds; a photo / busy background can't be cut out this
// way. Pure: works on an ImageData-like { data, width, height } in place.

const dist = (d, i, c) => Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2]));

// The most common colour along the border (in steps of 8, so tiny noise
// doesn't split it) → [r, g, b] | null when the border is already transparent.
export function borderColor({ data, width, height }) {
  const counts = new Map();
  let opaque = 0;
  const add = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return;
    opaque += 1;
    const k = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
    const c = counts.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    c.n += 1; c.r += data[i]; c.g += data[i + 1]; c.b += data[i + 2];
    counts.set(k, c);
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { add(0, y); add(width - 1, y); }
  if (!opaque) return null;
  let best = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return [best.r / best.n, best.g / best.n, best.b / best.n].map(Math.round);
}

// → number of pixels made (fully or partly) transparent. `tolerance` = how far
// from the background colour still counts as background (0–255).
export function removeBackground(img, { tolerance = 40, feather = 24 } = {}) {
  const { data, width, height } = img;
  const bg = borderColor(img);
  if (!bg) return 0;
  const limit = tolerance + feather;
  const seen = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    if (data[i + 3] === 0 || dist(data, i, bg) <= limit) stack.push(p);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  let changed = 0;
  while (stack.length) {
    const p = stack.pop();
    const i = p * 4;
    const d = dist(data, i, bg);
    const a = d <= tolerance ? 0 : Math.round(255 * ((d - tolerance) / Math.max(1, feather)));
    if (a < data[i + 3]) { data[i + 3] = a; changed += 1; }
    // Only keep spreading through real background, not through the soft edge.
    if (d > tolerance) continue;
    const x = p % width, y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  return changed;
}

// Browser helper: an image URL → a transparent-background PNG Blob (max 1200
// px on the long side, to stay fast on a phone). Needs a CORS-enabled image
// (Cloudinary uploads are).
export async function removeBackgroundFromUrl(url, opts = {}) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Could not load the image."));
    im.src = url;
  });
  const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const changed = removeBackground(data, opts);
  if (!changed) throw new Error("No plain background found to remove (it may already be transparent).");
  ctx.putImageData(data, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the PNG."))), "image/png"));
}
