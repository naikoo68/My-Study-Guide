// INSTANT preview of a thumbnail / intro / end-slide text box, drawn in the
// browser — a mirror of the server's buildThumbnailHtml (backend
// config/ytThumbnail.js): same sizes, colours, font, outline, shadow, shade,
// alignment, line spacing, rotation and "shrink only if it overflows" rule.
// It is laid out at the REAL slide size (e.g. 1080×1920) and scaled down to the
// editor frame, so every change shows immediately while you drag or slide —
// no waiting for the server. (The server still renders the final image.)
import { useLayoutEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:5000/api");
const SANS = `"Inter","Noto Sans","Noto Sans Devanagari","DejaVu Sans","FreeSans",Arial,sans-serif`;
const STACKS = {
  sans: SANS,
  serif: `"Noto Serif","DejaVu Serif","FreeSerif","Times New Roman",serif`,
  mono: `"Noto Sans Mono","DejaVu Sans Mono","FreeMono",monospace`,
};
const BUNDLED = { anton: 400, bebas: 400, poppins: 800, oswald: 700, montserrat: 800 };
const loaded = new Set();
function useFontFamily(key) {
  if (STACKS[key]) return { family: STACKS[key], weight: 900 };
  if (!(key in BUNDLED)) return { family: SANS, weight: 900 };
  const fam = `MSG_live_${key}`;
  if (!loaded.has(key) && typeof document !== "undefined") {
    loaded.add(key);
    const st = document.createElement("style");
    st.textContent = `@font-face{font-family:"${fam}";src:url(${API_BASE}/youtube/fonts/${key}) format("truetype");font-weight:100 900;font-display:swap;}`;
    document.head.appendChild(st);
  }
  return { family: `"${fam}",${SANS}`, weight: BUNDLED[key] };
}
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? v : d);
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
function rgba(color, pct) {
  const h = hex(color, "");
  if (!h) return "transparent";
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${num(pct, 100, 0, 100) / 100})`;
}

// cfg: the editor's draft (box, align, vAlign, font, uppercase, headlineSize,
// kickerSize, badgeSize, lineHeight, rotate, textColor, kickerColor,
// accentColor, badgeTextColor, strokeColor, strokeWidth, shadow, panelColor,
// panelOpacity, panelRadius). lines: { kicker, headline, badge }.
// W × H: the real slide size. frameW: the editor frame's width in px.
export default function LiveTextBox({ cfg = {}, lines = {}, W, H, frameW, defaults = {} }) {
  const d = { textColor: "#ffffff", accentColor: "#facc15", badgeTextColor: "#111111", strokeWidth: 3, headlineSize: 104, lineHeight: 1.05, ...defaults };
  const box = cfg.box || { x: 0.05, y: 0.12, w: 0.56, h: 0.76 };
  const bw = Math.max(1, box.w * W), bh = Math.max(1, box.h * H);
  const k = frameW > 0 ? frameW / W : 0;
  const { family, weight } = useFontFamily(cfg.font || "sans");
  const hSize = num(cfg.headlineSize, d.headlineSize, 24, 200);
  const lh = num(cfg.lineHeight, d.lineHeight, 0.8, 2);
  const sw = num(cfg.strokeWidth, d.strokeWidth, 0, 16);
  const color = hex(cfg.textColor, d.textColor);
  const align = ["left", "center", "right"].includes(cfg.align) ? cfg.align : "left";
  const shadow = cfg.shadow !== false;
  const panelOn = num(cfg.panelOpacity, 0, 0, 100) > 0 && hex(cfg.panelColor, "");

  // Same rule as the server: start at the chosen size, shrink only on overflow.
  const hRef = useRef(null), boxRef = useRef(null), innerRef = useRef(null);
  const [size, setSize] = useState(hSize);
  const sig = JSON.stringify([cfg, lines, W, H, family]);
  useLayoutEffect(() => {
    const h = hRef.current, b = boxRef.current, inner = innerRef.current;
    if (!h || !b || !inner) { setSize(hSize); return; }
    let s = hSize;
    h.style.fontSize = `${s}px`;
    const over = () => Math.round(h.offsetHeight / (s * lh)) > 3 || h.scrollWidth > h.clientWidth + 4 || inner.scrollHeight > b.clientHeight - 4;
    while (s > 24 && over()) { s -= 4; h.style.fontSize = `${s}px`; }
    setSize(s);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!k) return null;
  const { kicker = "", headline = "", badge = "" } = lines;
  return (
    <div className="pointer-events-none absolute left-0 top-0" style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: "top left" }}>
      <div ref={boxRef} style={{
        position: "absolute", left: box.x * W, top: box.y * H, width: bw, height: bh,
        display: "flex", flexDirection: "column", textAlign: align,
        justifyContent: cfg.vAlign === "top" ? "flex-start" : cfg.vAlign === "bottom" ? "flex-end" : "center",
        alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        transform: cfg.rotate ? `rotate(${num(cfg.rotate, 0, -180, 180)}deg)` : undefined, transformOrigin: "center center",
        fontFamily: family,
      }}>
        <div ref={innerRef} style={{
          display: "flex", flexDirection: "column", gap: 16, maxWidth: "100%", alignItems: "inherit",
          ...(panelOn ? { background: rgba(cfg.panelColor, cfg.panelOpacity), borderRadius: num(cfg.panelRadius, 24, 0, 80), padding: "24px 32px" } : {}),
        }}>
          {kicker && (
            <div style={{ fontSize: num(cfg.kickerSize, 44, 12, 120), fontWeight: 800, color: hex(cfg.kickerColor, "") || color, letterSpacing: 1,
              textTransform: cfg.uppercase ? "uppercase" : undefined, textShadow: shadow ? "0 3px 10px rgba(0,0,0,.75)" : undefined }}>{kicker}</div>
          )}
          {headline && (
            <div ref={hRef} style={{ fontSize: size, lineHeight: lh, fontWeight: weight, color, width: "100%", overflowWrap: "break-word",
              textTransform: cfg.uppercase ? "uppercase" : undefined,
              ...(sw > 0 ? { WebkitTextStroke: `${sw}px ${hex(cfg.strokeColor, "#000000")}`, paintOrder: "stroke fill" } : {}),
              textShadow: shadow ? "0 6px 18px rgba(0,0,0,.8)" : undefined }}>{headline}</div>
          )}
          {badge && (
            <div style={{ display: "inline-block", fontSize: num(cfg.badgeSize, 46, 12, 120), fontWeight: 900,
              color: hex(cfg.badgeTextColor, d.badgeTextColor), background: hex(cfg.accentColor, d.accentColor),
              padding: "8px 26px", borderRadius: 14, boxShadow: "0 6px 18px rgba(0,0,0,.45)" }}>{badge}</div>
          )}
        </div>
      </div>
    </div>
  );
}
