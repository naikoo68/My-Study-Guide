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
  it("unknown name: keeps the book ICON but gets a varied, STABLE emoji/colour", () => {
    // No keyword match still uses the neutral book line-icon…
    expect(subjectIconName("Underwater Basket Weaving")).toBe("BookOpen");
    // …but the emoji/colour are now picked from a varied pool (so different
    // subjects don't all show the same book), deterministically per name.
    const emoji = subjectEmoji("Underwater Basket Weaving");
    expect(emoji).toBeTruthy();
    expect(subjectEmoji("Underwater Basket Weaving")).toBe(emoji); // same name → same glyph
    expect(subjectColor("Underwater Basket Weaving")).toMatch(/^from-.+ to-.+$/);
    // Two different unknown names should generally differ (variety, not identical).
    expect(subjectEmoji("Underwater Basket Weaving")).not.toBe(subjectEmoji("Speculative Cartography"));
  });

  it("never throws on nullish/empty input (uses the safe defaults)", () => {
    expect(subjectIconName(null)).toBe("BookOpen");
    expect(subjectEmoji(undefined)).toBe("📘");
    expect(subjectColor("")).toBe("from-violet-500 to-fuchsia-600");
  });
});
