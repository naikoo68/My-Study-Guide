import katex from "katex";
import "katex/dist/katex.min.css";

// Lightweight renderer for DOCUMENT text: turns the raw text (as stored) into
// its formatted "actual form" for previews. It understands:
//   - Headings:  #, ##, ###, #### …  → shown in BOLD (bigger for #/##).
//   - Bold:      **text**  or  __text__  → bold.
//   - Math:      $…$ (inline) and $$…$$ (block) → rendered with KaTeX.
// Anything else is plain text; line breaks are preserved.
//
// Documents are always SAVED as raw text (so they stay editable, convertible
// and copyable); this component only affects how they are DISPLAYED.

// Render one line's inline tokens: math ($…$ / $$…$$) and bold (**…** / __…__).
function renderInline(text, keyPrefix) {
  const parts = [];
  const regex = /\$\$([^$]+)\$\$|\$([^$]+)\$|\*\*([^*]+)\*\*|__([^_]+)__/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`${keyPrefix}-t${i}`}>{text.slice(last, m.index)}</span>);
    if (m[1] != null || m[2] != null) {
      const value = m[1] ?? m[2];
      parts.push(
        <span
          key={`${keyPrefix}-m${i}`}
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(value, { throwOnError: false, displayMode: m[1] != null }),
          }}
        />
      );
    } else {
      parts.push(<strong key={`${keyPrefix}-b${i}`}>{m[3] ?? m[4]}</strong>);
    }
    last = regex.lastIndex;
    i += 1;
  }
  if (last < text.length) parts.push(<span key={`${keyPrefix}-t${i}`}>{text.slice(last)}</span>);
  return parts;
}

export default function RichText({ children, className = "" }) {
  const text = String(children ?? "");
  const lines = text.split(/\r?\n/);
  return (
    <div className={`space-y-1 ${className}`}>
      {lines.map((line, idx) => {
        const h = line.match(/^\s*(#{1,6})\s*(.+?)\s*$/);
        if (h) {
          const level = h[1].length;
          const size = level <= 1 ? "text-lg" : level === 2 ? "text-base" : "text-sm";
          return (
            <p key={idx} className={`font-bold ${size}`}>
              {renderInline(h[2], idx)}
            </p>
          );
        }
        if (line.trim() === "") return <div key={idx} className="h-2" />;
        return <p key={idx}>{renderInline(line, idx)}</p>;
      })}
    </div>
  );
}
