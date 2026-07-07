import { useSettings } from "../../context/SettingsContext";

// A tiled, diagonal, semi-transparent watermark drawn over the whole viewport
// on quiz/test pages. It sits above the content but ignores pointer events, so
// any screenshot a student takes automatically carries the site's copyright
// mark. The label is admin-editable (Customization → Watermark).
export default function Watermark() {
  const { settings } = useSettings();
  if (settings?.watermarkEnabled === false) return null;

  const base = (settings?.watermarkText || "").trim() || `${settings?.siteName || "My Study Guide"} ©`;
  const year = new Date().getFullYear();
  const label = base.includes("©") ? `${base} ${year}` : `${base} © ${year}`;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[45] select-none overflow-hidden">
      <div className="absolute left-1/2 top-1/2 flex w-[220vw] max-w-none -translate-x-1/2 -translate-y-1/2 rotate-[-24deg] flex-wrap justify-center gap-x-16 gap-y-16 opacity-[0.10]">
        {Array.from({ length: 140 }).map((_, i) => (
          <span key={i} className="whitespace-nowrap text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
