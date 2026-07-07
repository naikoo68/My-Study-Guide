import { useEffect, useState } from "react";
import { useSettings } from "../../context/SettingsContext";

// A tiled, diagonal, semi-transparent watermark drawn over the viewport on
// quiz/test pages so screenshots carry the site's copyright mark. Admin controls
// the text, opacity, size and mode:
//   - "always"     : always visible (reliable — appears in every screenshot)
//   - "screenshot" : hidden normally, briefly revealed when a screenshot
//                    shortcut is detected (best-effort; can't catch OS snip
//                    tools or phone screenshots — browsers give no screenshot API)
export default function Watermark() {
  const { settings } = useSettings();
  const enabled = settings?.watermarkEnabled !== false;
  const mode = settings?.watermarkMode || "always";
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!enabled || mode !== "screenshot") return;
    let timer;
    const reveal = () => {
      setFlash(true);
      clearTimeout(timer);
      timer = setTimeout(() => setFlash(false), 2500);
    };
    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      const combo = (e.metaKey || e.ctrlKey) && e.shiftKey && ["s", "3", "4", "5"].includes(k);
      if (k === "printscreen" || combo) reveal();
    };
    // Many screenshot tools (e.g. Win+Shift+S) blur/hide the page while active —
    // revealing on blur/visibility helps the mark appear in those captures.
    const onBlur = () => reveal();
    const onVis = () => { if (document.hidden) reveal(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true); // some OSes only fire PrintScreen on keyup
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, mode]);

  if (!enabled) return null;
  if (mode === "screenshot" && !flash) return null;

  const opacity = Math.min(0.6, Math.max(0.02, (Number(settings?.watermarkOpacity) || 10) / 100));
  const size = Math.min(48, Math.max(8, Number(settings?.watermarkSize) || 14));
  const base = (settings?.watermarkText || "").trim() || `${settings?.siteName || "My Study Guide"} ©`;
  const year = new Date().getFullYear();
  const label = base.includes("©") ? `${base} ${year}` : `${base} © ${year}`;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[45] select-none overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 flex w-[240vw] max-w-none -translate-x-1/2 -translate-y-1/2 rotate-[-24deg] flex-wrap justify-center gap-x-16 gap-y-16"
        style={{ opacity }}
      >
        {Array.from({ length: 220 }).map((_, i) => (
          <span
            key={i}
            className="whitespace-nowrap font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300"
            style={{ fontSize: `${size}px` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
