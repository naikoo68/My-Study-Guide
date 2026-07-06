import katex from "katex";
import "katex/dist/katex.min.css";

// Renders text that may contain LaTeX math.
// Use $...$ for inline math and $$...$$ for block math, e.g.
//   "Solve $x^2 + 2x - 3 = 0$"  →  renders the equation nicely.
export default function MathText({ children, className = "" }) {
  const text = String(children ?? "");
  // `whitespace-pre-line` preserves line breaks in multi-line questions.
  if (!text.includes("$")) return <span className={`whitespace-pre-line ${className}`}>{text}</span>;

  const parts = [];
  const regex = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "math", value: m[1] ?? m[2], block: !!m[1] });
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

  return (
    <span className={`whitespace-pre-line ${className}`}>
      {parts.map((p, i) =>
        p.type === "math" ? (
          <span
            key={i}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(p.value, {
                throwOnError: false,
                displayMode: p.block,
              }),
            }}
          />
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </span>
  );
}
