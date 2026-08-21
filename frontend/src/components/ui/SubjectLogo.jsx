import * as Icons from "lucide-react";
import { subjectIconName, subjectEmoji, subjectColor } from "../../lib/subjectIcon";

// The two "default" colours the two subject models ship with — treat them as
// "not customised" so we auto-pick a per-subject colour instead.
const DEFAULT_COLORS = ["from-violet-500 to-fuchsia-600", "from-blue-500 to-indigo-600"];

// Shared, consistent subject logo used everywhere subjects are listed (public
// content + practice, client workspace, and institute tenants — all reuse these
// views). Priority: custom uploaded image → admin-chosen lucide icon → an
// auto-picked colourful emoji + colour tile derived from the subject name.
export default function SubjectLogo({ name = "", icon = "", color = "", image = "", size = 56, className = "" }) {
  const box = { width: size, height: size };
  const base = `flex flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-soft ${className}`;

  if (image) {
    return (
      <div style={box} className={`${base} border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800`}>
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
        <Icon size={Math.round(size * 0.5)} />
      </div>
    );
  }

  return (
    <div style={box} className={`${base} bg-gradient-to-br ${tile} text-white`}>
      <span role="img" aria-label={name} className="leading-none drop-shadow-sm" style={{ fontSize: Math.round(size * 0.5) }}>
        {subjectEmoji(name)}
      </span>
    </div>
  );
}
