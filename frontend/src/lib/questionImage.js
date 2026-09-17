// Capture a DOM node as a PNG in the browser — used to post a question to
// Facebook/Instagram as an image that looks EXACTLY like the quiz rendering
// (same KaTeX math the students see), instead of a server-drawn approximation.
//
// We use `html-to-image`, which rasterises through an SVG <foreignObject> so the
// BROWSER'S OWN engine renders the HTML/CSS (KaTeX fractions, subscripts, etc.)
// — unlike html2canvas, which re-implements layout and mangles KaTeX (fraction
// bars land on the numerator, subscripts collapse). It also inlines web fonts so
// the math fonts appear in the image. Loaded from a CDN so there's no npm dep
// (keeps auto-deploy working). Callers should fall back to the server-rendered
// card if this throws (e.g. offline / CDN blocked).

let _loader = null;

function loadHtmlToImage() {
  if (typeof window !== "undefined" && window.htmlToImage) return Promise.resolve(window.htmlToImage);
  if (_loader) return _loader;
  _loader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js";
    s.async = true;
    s.onload = () => (window.htmlToImage ? resolve(window.htmlToImage) : reject(new Error("Image tool failed to initialise.")));
    s.onerror = () => { _loader = null; reject(new Error("Could not load the image tool (check your connection).")); };
    document.head.appendChild(s);
  });
  return _loader;
}

// Render `node` to an image Blob. `scale` (2) gives a crisp, retina-quality
// image. `type` picks the format ("image/png" default, or "image/jpeg" for a
// smaller shareable file); `quality` (0–1) applies to JPEG only. `filter` is an
// optional predicate `(domNode) => boolean` — return false to EXCLUDE a node
// (and its subtree) from the capture, e.g. to drop interactive buttons.
export async function captureNodeToBlob(node, { scale = 2, type = "image/png", quality = 0.95, filter } = {}) {
  if (!node) throw new Error("Nothing to capture.");
  const lib = await loadHtmlToImage();
  // Make sure web fonts (including the KaTeX math fonts) are ready so the
  // formulas render into the screenshot instead of falling back to boxes.
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }
  const blob = await lib.toBlob(node, {
    pixelRatio: scale,
    backgroundColor: "#ffffff",
    cacheBust: true,
    ...(type ? { type } : {}),
    ...(type === "image/jpeg" ? { quality } : {}),
    ...(typeof filter === "function" ? { filter } : {}),
  });
  if (!blob) throw new Error("Could not render the image.");
  return blob;
}

// Trigger a browser download of a Blob under `filename`. Revokes the temporary
// object URL shortly after so we don't leak it.
export function downloadBlob(blob, filename) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
