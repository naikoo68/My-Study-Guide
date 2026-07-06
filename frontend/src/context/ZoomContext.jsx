import { createContext, useContext, useEffect, useState, useCallback } from "react";

const ZoomContext = createContext();
const MIN = 0.5;
const MAX = 2;
const DEFAULT = 0.8; // default page zoom (80%)
const KEY = "msg-zoom-v2"; // bumped so everyone picks up the new default

// Site-wide zoom. The chosen level is applied to the whole document and
// remembered across pages/reloads. Full-screen quiz/test screens apply the
// same value to their own container (the browser's top layer ignores the
// document zoom while an element is full-screen).
export function ZoomProvider({ children }) {
  const [zoom, setZoomState] = useState(() => {
    const v = parseFloat(localStorage.getItem(KEY));
    return v >= MIN && v <= MAX ? v : DEFAULT;
  });

  useEffect(() => {
    // Scale the root font-size instead of using the CSS `zoom` property.
    // Tailwind sizes are rem-based, so this zooms the whole layout and — unlike
    // `zoom` — works correctly on iOS Safari (portrait, landscape & overlays).
    document.documentElement.style.fontSize = `${Math.round(zoom * 100)}%`;
    localStorage.setItem(KEY, String(zoom));
  }, [zoom]);

  const clamp = (v) => Math.min(MAX, Math.max(MIN, +(+v).toFixed(2)));
  const setZoom = useCallback((v) => setZoomState(clamp(v)), []);
  const zoomIn = useCallback(() => setZoomState((z) => clamp(z + 0.1)), []);
  const zoomOut = useCallback(() => setZoomState((z) => clamp(z - 0.1)), []);
  const resetZoom = useCallback(() => setZoomState(DEFAULT), []);

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
