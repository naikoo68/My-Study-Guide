import katex from "katex";
import "katex/dist/katex.min.css";

// Lightweight renderer for DOCUMENT text: turns the raw text (as stored) into
// its formatted "actual form" for previews. It understands a Word-like subset:
//   - Headings:  #, ##, ###, #### …           → bold (bigger for #/##).
//   - Bold:      **text**  or  __text__        → bold.
//   - Italic:    *text*    or  _text_          → italic.
//   - Underline: <u>text</u>                    → underline.
//   - Strike:    ~~text~~                        → strikethrough.
//   - Lists:     "- item" / "* item"            → bullet;  "1. item" stays numbered.
//   - Math:      $…$ (inline) and $$…$$ (block)  → KaTeX.
// Anything else is plain text; line breaks are preserved.
//
// Documents are always SAVED as raw text (so they stay editable, convertible
// and copyable); this component only affects how they are DISPLAYED.

// Order matters: $$ before $, ** before *, __ before _.
const INLINE_RE =
  /\$\$([^$]+)\$\$|\$([^$]+)\$|<u>([\s\S]*?)<\/u>|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g;

function renderInline(text, keyPrefix) {
  const parts = [];
  let last = 0;
  let m;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`${keyPrefix}-t${i}`}>{text.slice(last, m.index)}</span>);
    if (m[1] != null || m[2] != null) {
      parts.push(
        <span
          key={`${keyPrefix}-m${i}`}
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(m[1] ?? m[2], { throwOnError: false, displayMode: m[1] != null }),
          }}
        />
      );
    } else if (m[3] != null) {
      parts.push(<u key={`${keyPrefix}-u${i}`}>{m[3]}</u>);
    } else if (m[4] != null || m[5] != null) {
      parts.push(<strong key={`${keyPrefix}-b${i}`}>{m[4] ?? m[5]}</strong>);
    } else if (m[6] != null) {
      parts.push(<del key={`${keyPrefix}-s${i}`}>{m[6]}</del>);
    } else {
      parts.push(<em key={`${keyPrefix}-i${i}`}>{m[7] ?? m[8]}</em>);
    }
    last = INLINE_RE.lastIndex;
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
        const b = line.match(/^\s*[-*]\s+(.*)$/);
        if (b) {
          return (
            <p key={idx} className="pl-4 -indent-2">• {renderInline(b[1], idx)}</p>
          );
        }
        if (line.trim() === "") return <div key={idx} className="h-2" />;
        return <p key={idx}>{renderInline(line, idx)}</p>;
      })}
    </div>
  );
}
