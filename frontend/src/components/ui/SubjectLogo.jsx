import * as Icons from "lucide-react";
import { subjectIconName, subjectEmoji, subjectColor } from "../../lib/subjectIcon";

// The two "default" colours the two subject models ship with — treat them as
// "not customised" so we auto-pick a per-subject colour instead.
const DEFAULT_COLORS = ["from-violet-500 to-fuchsia-600", "from-blue-500 to-indigo-600"];

// Shared, consistent subject logo used everywhere subjects are listed (public
// content + practice, client workspace, and institute tenants — all reuse these
// views). Priority: custom uploaded image → admin-chosen lucide icon → an
// auto-picked colourful emoji + colour tile derived from the subject name.
export default function SubjectLogo({ name = "", icon = "", color = "", image = "", size = 56, className = "", fill = false }) {
  // `fill` makes the logo fill its parent (used as a full-bleed card banner)
  // instead of a fixed rounded square tile.
  const box = fill ? undefined : { width: size, height: size };
  const shape = fill ? "h-full w-full" : "rounded-2xl shadow-soft";
  const base = `flex flex-shrink-0 items-center justify-center overflow-hidden ${shape} ${className}`;
  const glyph = fill ? 52 : Math.round(size * 0.5);

  if (image) {
    return (
      <div style={box} className={`${base} ${fill ? "" : "border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>
        <img src={image} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  const tile = color && !DEFAULT_COLORS.includes(color) ? color : subjectColor(name);
  const hasCustomIcon = icon && icon !== "BookOpen";

  if (hasCustomIcon) {
    const Icon = Icons[icon] || Icons.BookOpen;
    return (
      <div style={box} className={`${base} bg-gradient-to-br ${tile} text-white`}>
        <Icon size={glyph} />
      </div>
    );
  }

  return (
    <div style={box} className={`${base} bg-gradient-to-br ${tile} text-white`}>
      <span role="img" aria-label={name} className="leading-none drop-shadow-sm" style={{ fontSize: glyph }}>
        {subjectEmoji(name)}
      </span>
    </div>
  );
}
