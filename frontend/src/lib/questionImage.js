// Capture a DOM node as a PNG in the browser — used to post a question to
// Facebook/Instagram as an image that looks EXACTLY like the quiz rendering
// (same KaTeX math the students see), instead of a server-drawn approximation.
//
// html2canvas is loaded from a CDN on first use so it needs no npm dependency
// (keeps auto-deploy working). Callers should fall back to the server-rendered
// card if this throws (e.g. offline / CDN blocked).

let _loader = null;

function loadHtml2Canvas() {
  if (typeof window !== "undefined" && window.html2canvas) return Promise.resolve(window.html2canvas);
  if (_loader) return _loader;
  _loader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.async = true;
    s.onload = () => (window.html2canvas ? resolve(window.html2canvas) : reject(new Error("Screenshot library failed to initialise.")));
    s.onerror = () => { _loader = null; reject(new Error("Could not load the screenshot tool (check your connection).")); };
    document.head.appendChild(s);
  });
  return _loader;
}

// Render `node` to a PNG Blob. `scale` (2) gives a crisp, retina-quality image.
export async function captureNodeToBlob(node, { scale = 2 } = {}) {
  if (!node) throw new Error("Nothing to capture.");
  const html2canvas = await loadHtml2Canvas();
  // Make sure web fonts (including the KaTeX math fonts) are ready so the
  // formulas render into the screenshot instead of falling back to boxes.
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }
  const canvas = await html2canvas(node, { scale, backgroundColor: "#ffffff", useCORS: true, logging: false });
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render the image."))), "image/png")
  );
}
