import { describe, it, expect } from "vitest";
import { subjectIconName, subjectEmoji, subjectColor } from "./subjectIcon.js";

describe("subjectIcon — recognised subjects", () => {
  const cases = [
    ["Chemistry", "FlaskConical", "⚗️"],
    ["Physics", "Atom", "⚛️"],
    ["Mathematics", "Sigma", "➗"],
    ["English Grammar", "Languages", "🔤"],
    ["Indian History", "Landmark", "🏛️"],
    ["Geography", "Globe", "🌍"],
    ["Computer Science", "Cpu", "💻"],
    ["Biology", "Dna", "🧬"],
  ];

  it.each(cases)("maps %s to its icon and emoji", (name, icon, emoji) => {
    expect(subjectIconName(name)).toBe(icon);
    expect(subjectEmoji(name)).toBe(emoji);
  });

  it("is case-insensitive", () => {
    expect(subjectIconName("CHEMISTRY")).toBe("FlaskConical");
    expect(subjectIconName("physics 101")).toBe("Atom");
  });

  it("returns a non-empty gradient colour for a recognised subject", () => {
    expect(subjectColor("Physics")).toMatch(/^from-.+ to-.+$/);
  });
});

describe("subjectIcon — unknown / empty names fall back safely", () => {
  it("uses the default book icon/emoji/colour", () => {
    expect(subjectIconName("Underwater Basket Weaving")).toBe("BookOpen");
    expect(subjectEmoji("Underwater Basket Weaving")).toBe("📘");
    expect(subjectColor("Underwater Basket Weaving")).toBe("from-violet-500 to-fuchsia-600");
  });

  it("never throws on nullish/empty input", () => {
    expect(subjectIconName(null)).toBe("BookOpen");
    expect(subjectEmoji(undefined)).toBe("📘");
    expect(subjectColor("")).toBe("from-violet-500 to-fuchsia-600");
  });
});
