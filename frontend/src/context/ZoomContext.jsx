import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { applyPageZoom } from "../lib/pageZoom";

const ZoomContext = createContext();
const MIN = 0.5;
const MAX = 2;
// Every visitor without a saved choice starts at 80% — on Android, iOS, desktop
// and every browser. This is FIXED on purpose: the old admin "Default page zoom"
// setting had been saved as 100 on the live site, which silently overrode the
// 80% for every new visitor, so it is no longer read.
const DEFAULT = 0.8;
// v3: the zoom now scales the WHOLE page (CSS zoom) instead of only rem sizes,
// so choices saved by the old method are not reused.
const KEY = "msg-zoom-v3";

const clamp = (v) => Math.min(MAX, Math.max(MIN, +(+v).toFixed(2)));

// Site-wide zoom. A visitor's own choice (stored in localStorage) always wins;
// otherwise the fixed 80% default is applied. Applied as
// CSS `zoom` on <html> (lib/pageZoom.js) so EVERYTHING scales, like the
// browser's own zoom — desktop, Android, iOS and in-app browsers.
export function ZoomProvider({ children }) {
  // Did the visitor explicitly pick a zoom before? If so, respect it.
  // Guarded: some social-media in-app browsers (Facebook / Instagram WebViews)
  // block or throw on localStorage. Without this, the read threw and the default
  // zoom never applied there — the page fell back to the browser-native 100%
  // instead of the 80% every other browser gets.
  let stored = NaN;
  try { stored = parseFloat(localStorage.getItem(KEY)); } catch { /* storage blocked (in-app browser) */ }
  const hadStored = stored >= MIN && stored <= MAX;

  const [zoom, setZoomState] = useState(hadStored ? stored : DEFAULT);

  // Reflect the current zoom on the document.
  useEffect(() => {
    applyPageZoom(zoom);
  }, [zoom]);

  // Persist only when the visitor deliberately changes the zoom.
  const apply = useCallback((v) => {
    const c = clamp(v);
    setZoomState(c);
    try { localStorage.setItem(KEY, String(c)); } catch { /* storage blocked (in-app browser) */ }
    return c;
  }, []);

  const setZoom = useCallback((v) => apply(v), [apply]);
  const zoomIn = useCallback(() => apply(zoom + 0.1), [apply, zoom]);
  const zoomOut = useCallback(() => apply(zoom - 0.1), [apply, zoom]);

  // Reset clears the personal choice and returns to the 80% default.
  const resetZoom = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* storage blocked (in-app browser) */ }
    setZoomState(DEFAULT);
  }, []);

  return (
    <ZoomContext.Provider value={{ zoom, zoomIn, zoomOut, setZoom, resetZoom, MIN, MAX }}>
      {children}
    </ZoomContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useZoom() {
  return useContext(ZoomContext);
}
