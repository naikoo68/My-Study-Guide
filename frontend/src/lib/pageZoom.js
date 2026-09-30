// Site-wide page zoom (default 80%) — applied as CSS `zoom` on <html>, so the
// WHOLE page scales like the browser's own zoom: text, px sizes, images,
// borders — on desktop, Android, iOS and in-app browsers (Facebook, Instagram,
// WhatsApp…). index.html applies it before the first paint; ZoomContext keeps
// it in sync with the visitor's choice / the admin default.
//
// With CSS zoom, viewport units (100vh) and getBoundingClientRect() are in
// SCREEN pixels while CSS lengths are zoomed — so full-height layouts use
// `calc(100vh * var(--unzoom))` (see tailwind.config.js) and anything that
// positions a fixed element from a measured rect divides by pageZoom().

// Pages screenshotted by the server (post / flashcard / slideshow images) must
// render at exactly 100%.
export const NO_ZOOM_PATHS = /^\/(q-card|flashcard|slide-card)(\/|$)/;

export function pageZoom() {
  if (typeof document === "undefined") return 1;
  const z = parseFloat(document.documentElement.style.zoom);
  return z > 0 ? z : 1;
}

export function applyPageZoom(z) {
  if (typeof document === "undefined") return;
  const zoom = NO_ZOOM_PATHS.test(window.location.pathname) ? 1 : z;
  const el = document.documentElement;
  el.style.zoom = String(zoom);
  el.style.setProperty("--unzoom", String(1 / zoom));
  el.style.fontSize = ""; // the old method scaled the root font-size — not any more
}

// A getBoundingClientRect() in the page's own (zoomed) CSS pixels — for placing
// fixed / absolute elements next to something.
export function zoomedRect(r) {
  const z = pageZoom();
  return { top: r.top / z, left: r.left / z, bottom: r.bottom / z, right: r.right / z, width: r.width / z, height: r.height / z };
}
export const viewportWidth = () => window.innerWidth / pageZoom();
export const viewportHeight = () => window.innerHeight / pageZoom();
