import { describe, it, expect } from "vitest";
import { naturalCompare, byNatural } from "../../src/utils/naturalSort.js";

describe("naturalCompare", () => {
  it("orders numeric suffixes like a human (2 before 10)", () => {
    expect(naturalCompare("Quiz 2", "Quiz 10")).toBeLessThan(0);
    expect(naturalCompare("Quiz 10", "Quiz 2")).toBeGreaterThan(0);
  });

  it("returns 0 for equal strings", () => {
    expect(naturalCompare("Chapter 1", "Chapter 1")).toBe(0);
  });

  it("is case-insensitive (base sensitivity)", () => {
    expect(naturalCompare("alpha", "ALPHA")).toBe(0);
  });

  it("treats null/undefined as empty strings without throwing", () => {
    expect(naturalCompare(null, undefined)).toBe(0);
    expect(naturalCompare(null, "a")).toBeLessThan(0);
    expect(naturalCompare("a", undefined)).toBeGreaterThan(0);
  });

  it("coerces non-string values", () => {
    expect(naturalCompare(2, 10)).toBeLessThan(0);
  });
});

describe("byNatural", () => {
  it("produces a comparator that sorts objects by a field naturally", () => {
    const items = [
      { title: "Quiz 10" },
      { title: "Quiz 2" },
      { title: "Quiz 1" },
    ];
    const sorted = items.slice().sort(byNatural("title"));
    expect(sorted.map((x) => x.title)).toEqual(["Quiz 1", "Quiz 2", "Quiz 10"]);
  });

  it("tolerates missing fields on either operand", () => {
    const items = [{ name: "b" }, {}, { name: "a" }];
    const sorted = items.slice().sort(byNatural("name"));
    // the empty object sorts first (empty string), then a, then b
    expect(sorted.map((x) => x.name ?? "")).toEqual(["", "a", "b"]);
  });
});
