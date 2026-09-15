import { describe, it, expect } from "vitest";
import { parseRichText } from "./aboutContent.js";

describe("parseRichText", () => {
  it("returns an empty array for nullish/empty input", () => {
    expect(parseRichText(null)).toEqual([]);
    expect(parseRichText(undefined)).toEqual([]);
    expect(parseRichText("")).toEqual([]);
    expect(parseRichText("   \n  \n ")).toEqual([]);
  });

  it("splits blocks on blank lines and treats long text as paragraphs", () => {
    const out = parseRichText("First long paragraph that clearly ends.\n\nSecond paragraph here too.");
    expect(out).toEqual([
      { type: "paragraph", text: "First long paragraph that clearly ends." },
      { type: "paragraph", text: "Second paragraph here too." },
    ]);
  });

  it("detects short, non-sentence single lines as headings", () => {
    const out = parseRichText("For Students\n\nStudents get a focused environment to practice and improve every day.");
    expect(out[0]).toEqual({ type: "heading", text: "For Students" });
    expect(out[1].type).toBe("paragraph");
  });

  it("treats the real About sections correctly", () => {
    const intro = [
      "For Creators & Educators",
      "For teachers and subject experts, the platform provides the infrastructure to turn knowledge into structured learning.",
      "For Schools, Coaching Centres & Institutions",
      "Institutions can manage students, content, assessments and results from one unified dashboard.",
    ].join("\n\n");
    const out = parseRichText(intro);
    expect(out.map((b) => b.type)).toEqual(["heading", "paragraph", "heading", "paragraph"]);
    expect(out[0].text).toBe("For Creators & Educators");
    expect(out[2].text).toBe("For Schools, Coaching Centres & Institutions");
  });

  it("does NOT treat a short sentence as a heading (trailing punctuation)", () => {
    expect(parseRichText("Thanks for reading.")).toEqual([
      { type: "paragraph", text: "Thanks for reading." },
    ]);
    expect(parseRichText("Note:")).toEqual([{ type: "paragraph", text: "Note:" }]);
  });

  it("supports explicit Markdown headings and strips the hashes", () => {
    const out = parseRichText("## Our Ecosystem\n\nBody text describing the ecosystem in enough detail.");
    expect(out[0]).toEqual({ type: "heading", text: "Our Ecosystem" });
    expect(out[1].type).toBe("paragraph");
  });

  it("keeps a multi-line block (e.g. a small list) as one paragraph with line breaks", () => {
    const block = "Students who want to improve\nCreators who publish content\nInstitutions that manage learning";
    const out = parseRichText(block);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("paragraph");
    expect(out[0].text).toContain("\n");
  });

  it("does not treat a long single line as a heading even without punctuation", () => {
    const longNoPunct =
      "This is a fairly long single line of text that runs well beyond sixty characters and therefore is a paragraph";
    expect(parseRichText(longNoPunct)).toEqual([{ type: "paragraph", text: longNoPunct }]);
  });
});
