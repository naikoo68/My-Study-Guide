import { describe, it, expect } from "vitest";
import {
  normName,
  dedupeExact,
  salvageObjects,
} from "../../src/utils/conceptDedupe.js";

describe("normName", () => {
  it("lowercases, drops a single leading article and collapses whitespace", () => {
    expect(normName("  The   Renaissance ")).toBe("renaissance");
    expect(normName("A History")).toBe("history");
    expect(normName("An Apple")).toBe("apple");
  });

  it("expands & to 'and' and turns punctuation into spaces", () => {
    expect(normName("Arts & Crafts!!!")).toBe("arts and crafts");
    expect(normName("C++ / C#")).toBe("c c");
  });

  it("only strips ONE leading article", () => {
    // "the a" -> drop leading "the" -> "a b" (second article kept)
    expect(normName("The A B")).toBe("a b");
  });

  it("handles nullish input", () => {
    expect(normName(null)).toBe("");
    expect(normName(undefined)).toBe("");
  });
});

describe("dedupeExact", () => {
  it("removes normalized duplicates, keeping the first occurrence", () => {
    const items = ["Algebra", "algebra", "  ALGEBRA  ", "Geometry"];
    expect(dedupeExact(items)).toEqual(["Algebra", "Geometry"]);
  });

  it("keeps legitimately-distinct names that merely share words", () => {
    const items = ["Algebra", "Linear Algebra", "Modern Physics", "Physics"];
    expect(dedupeExact(items)).toEqual(items);
  });

  it("drops items whose normalized name matches an existing name", () => {
    const items = ["Biology", "The Chemistry", "Physics"];
    const existing = ["chemistry", "physics"];
    expect(dedupeExact(items, (x) => x, existing)).toEqual(["Biology"]);
  });

  it("supports a getName accessor for objects", () => {
    const items = [{ name: "Trigonometry" }, { name: "trigonometry" }];
    expect(dedupeExact(items, (x) => x.name)).toEqual([{ name: "Trigonometry" }]);
  });

  it("returns an empty array for nullish input", () => {
    expect(dedupeExact(null)).toEqual([]);
    expect(dedupeExact(undefined)).toEqual([]);
  });
});

describe("salvageObjects", () => {
  it("extracts complete objects from a truncated JSON array", () => {
    const text = '[{"a":1},{"b":2},{"c":';
    expect(salvageObjects(text)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("ignores braces that appear inside strings", () => {
    const text = '[{"note":"a } b { c"},{"x":3}]';
    expect(salvageObjects(text)).toEqual([{ note: "a } b { c" }, { x: 3 }]);
  });

  it("handles escaped quotes inside string values", () => {
    const text = '[{"q":"say \\"hi\\" now"}]';
    expect(salvageObjects(text)).toEqual([{ q: 'say "hi" now' }]);
  });

  it("parses nested objects as a single top-level object", () => {
    const text = '[{"a":{"b":2}},{"c":3}]';
    expect(salvageObjects(text)).toEqual([{ a: { b: 2 } }, { c: 3 }]);
  });

  it("skips malformed fragments without throwing", () => {
    const text = '[{"a":1},{bad json},{"c":3}]';
    expect(salvageObjects(text)).toEqual([{ a: 1 }, { c: 3 }]);
  });

  it("returns an empty array when nothing is salvageable", () => {
    expect(salvageObjects("")).toEqual([]);
    expect(salvageObjects(null)).toEqual([]);
    expect(salvageObjects("no objects here")).toEqual([]);
  });
});
