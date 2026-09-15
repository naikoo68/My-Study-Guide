// Parse a plain-text "rich" content field (e.g. the admin-editable About intro)
// into an ordered list of blocks so the page can render real headings and
// paragraphs instead of one flat, centered wall of text.
//
// WHY: admins edit the About intro in a single textarea. When they paste a long,
// multi-section write-up, the section labels ("For Students", "For Creators &
// Educators", …) are just lines of plain text — so they render un-bolded and the
// whole thing looks unstructured. This infers structure from the text so those
// labels become proper <h2> headings and the body reads as an article.
//
// Rules (applied per block, a block = text separated by one or more blank lines):
//   1. A block beginning with 1–3 leading "#" is an explicit Markdown heading.
//   2. Otherwise a SHORT (≤ 60 chars), single-line block that does NOT end like
//      a sentence (no trailing . ! ? : , ; – — …) reads as a section heading.
//   3. Everything else is a paragraph; internal line breaks are preserved so
//      simple lists (one item per line) still stack.
//
// Returns: Array<{ type: "heading" | "paragraph", text: string }>.

const HEADING_MAX_LEN = 60;
const SENTENCE_END = /[.!?:,;–—…]$/;

export function parseRichText(text) {
  if (typeof text !== "string" || !text.trim()) return [];

  return text
    .split(/\n\s*\n/) // split on blank line(s) into blocks
    .map((block) => block.trim()) // trim block edges, keep internal newlines
    .filter(Boolean)
    .map((raw) => {
      // 1) Explicit Markdown heading: "# Title", "## Title", "### Title".
      const md = raw.match(/^#{1,3}\s+(\S.*)$/);
      if (md && !raw.includes("\n")) {
        return { type: "heading", text: md[1].trim() };
      }

      // 2) Heuristic heading: short, single line, not sentence-like.
      const singleLine = !raw.includes("\n");
      if (singleLine && raw.length <= HEADING_MAX_LEN && !SENTENCE_END.test(raw)) {
        return { type: "heading", text: raw };
      }

      // 3) Paragraph (may contain internal line breaks).
      return { type: "paragraph", text: raw };
    });
}
