import { describe, it, expect } from "vitest";
import {
  makeSeed,
  shuffleQuestion,
  shuffleAll,
  shuffleQuestionOrder,
  toOriginalIndex,
  toDisplayIndex,
} from "./shuffleOptions.js";

const q = () => ({
  _id: "q-abc-123",
  options: ["Paris", "London", "Berlin", "Madrid"],
  optionExplanations: ["capital of FR", "capital of UK", "capital of DE", "capital of ES"],
  correct: 0, // Paris
});

describe("makeSeed", () => {
  it("returns an unsigned 32-bit integer", () => {
    for (let i = 0; i < 10; i++) {
      const s = makeSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("shuffleQuestion", () => {
  it("is deterministic for the same seed", () => {
    const a = shuffleQuestion(q(), 42);
    const b = shuffleQuestion(q(), 42);
    expect(a.options).toEqual(b.options);
    expect(a._order).toEqual(b._order);
    expect(a.correct).toBe(b.correct);
  });

  it("returns a permutation of the original options", () => {
    const r = shuffleQuestion(q(), 7);
    expect([...r.options].sort()).toEqual([...q().options].sort());
    expect(r._order).toHaveLength(4);
    expect([...r._order].sort()).toEqual([0, 1, 2, 3]);
  });

  it("keeps _order consistent with the displayed options", () => {
    const original = q();
    const r = shuffleQuestion(original, 123);
    r._order.forEach((origIdx, displayIdx) => {
      expect(r.options[displayIdx]).toBe(original.options[origIdx]);
      expect(r.optionExplanations[displayIdx]).toBe(original.optionExplanations[origIdx]);
    });
  });

  it("remaps the correct index so it still points at the right answer", () => {
    const original = q();
    const r = shuffleQuestion(original, 99);
    expect(r.options[r.correct]).toBe(original.options[original.correct]); // still "Paris"
  });

  it("keeps blank option slots at the end", () => {
    const tf = { _id: "tf1", options: ["True", "False", "", ""], correct: 1 };
    const r = shuffleQuestion(tf, 5);
    expect(r.options.slice(2)).toEqual(["", ""]);
    expect(r.options.slice(0, 2).sort()).toEqual(["False", "True"]);
  });

  it("returns the question unchanged when there are fewer than 2 options", () => {
    const one = { _id: "x", options: ["only"], correct: 0 };
    expect(shuffleQuestion(one, 1)).toBe(one);
    expect(shuffleQuestion(null, 1)).toBe(null);
  });
});

describe("toOriginalIndex / toDisplayIndex", () => {
  it("map a display choice back to the original stored index", () => {
    const r = shuffleQuestion(q(), 55);
    for (let d = 0; d < r.options.length; d++) {
      expect(toOriginalIndex(r, d)).toBe(r._order[d]);
    }
  });

  it("are inverse of each other", () => {
    const r = shuffleQuestion(q(), 8);
    for (let orig = 0; orig < 4; orig++) {
      expect(toOriginalIndex(r, toDisplayIndex(r, orig))).toBe(orig);
    }
  });

  it("are no-ops when the question was not shuffled (no _order)", () => {
    expect(toOriginalIndex({ options: [] }, 2)).toBe(2);
    expect(toDisplayIndex({ options: [] }, 2)).toBe(2);
    expect(toOriginalIndex({}, null)).toBe(null);
  });
});

describe("shuffleAll", () => {
  it("shuffles every question in the list", () => {
    const out = shuffleAll([q(), q()], 3);
    expect(out).toHaveLength(2);
    out.forEach((r) => expect(r._order).toHaveLength(4));
  });

  it("returns [] for non-array input", () => {
    expect(shuffleAll(null, 1)).toEqual([]);
  });
});

describe("shuffleQuestionOrder", () => {
  const list = [
    { _id: "a", section: "Math" },
    { _id: "b", section: "Math" },
    { _id: "c", section: "Science" },
    { _id: "d", section: "Science" },
    { _id: "e" }, // unsectioned
  ];

  it("is deterministic for the same seed", () => {
    const a = shuffleQuestionOrder(list, 21).map((x) => x._id);
    const b = shuffleQuestionOrder(list, 21).map((x) => x._id);
    expect(a).toEqual(b);
  });

  it("keeps every question (a permutation of the input)", () => {
    const out = shuffleQuestionOrder(list, 4).map((x) => x._id);
    expect(out.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps each section's questions grouped together", () => {
    const out = shuffleQuestionOrder(list, 4);
    const sections = out.map((x) => (x.section || "").trim());
    // Every section should appear as one contiguous block.
    const seen = new Set();
    let prev = null;
    for (const s of sections) {
      if (s !== prev) {
        expect(seen.has(s)).toBe(false); // never revisit a section
        seen.add(s);
        prev = s;
      }
    }
  });

  it("places unsectioned questions last", () => {
    const out = shuffleQuestionOrder(list, 4);
    expect(out[out.length - 1]._id).toBe("e");
  });

  it("returns [] for non-array input", () => {
    expect(shuffleQuestionOrder(null, 1)).toEqual([]);
  });
});
