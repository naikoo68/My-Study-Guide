import { describe, it, expect } from "vitest";
import {
  typeKeyOf,
  groupByType,
  uniqueName,
  TYPE_ORDER,
} from "../../src/utils/questionTypes.js";

describe("typeKeyOf", () => {
  it("returns the known type verbatim", () => {
    expect(typeKeyOf({ type: "assertion" })).toBe("assertion");
    expect(typeKeyOf({ type: "matching" })).toBe("matching");
  });

  it("collapses unknown/blank/missing types to mcq", () => {
    expect(typeKeyOf({ type: "totally-unknown" })).toBe("mcq");
    expect(typeKeyOf({ type: "" })).toBe("mcq");
    expect(typeKeyOf({})).toBe("mcq");
    expect(typeKeyOf(null)).toBe("mcq");
  });
});

describe("groupByType", () => {
  it("groups ids by type following TYPE_ORDER and includes only present types", () => {
    const questions = [
      { _id: "a", type: "assertion" },
      { _id: "b", type: "mcq" },
      { _id: "c", type: "assertion" },
      { _id: "d" }, // -> mcq
    ];
    const groups = groupByType(questions);
    // mcq comes before assertion in TYPE_ORDER
    expect(groups.map((g) => g.typeKey)).toEqual(["mcq", "assertion"]);
    const mcq = groups.find((g) => g.typeKey === "mcq");
    const assertion = groups.find((g) => g.typeKey === "assertion");
    expect(mcq.ids).toEqual(["b", "d"]); // input order preserved
    expect(assertion.ids).toEqual(["a", "c"]);
    expect(mcq.label).toBe("MCQ");
    expect(assertion.label).toBe("Assertion & Reason");
  });

  it("returns an empty array for empty/nullish input", () => {
    expect(groupByType([])).toEqual([]);
    expect(groupByType(null)).toEqual([]);
    expect(groupByType(undefined)).toEqual([]);
  });

  it("only ever emits types that appear in TYPE_ORDER", () => {
    const groups = groupByType([{ _id: "x", type: "mcq" }]);
    for (const g of groups) expect(TYPE_ORDER).toContain(g.typeKey);
  });
});

describe("uniqueName", () => {
  it("returns the label unchanged when unused and records it", () => {
    const used = new Set();
    expect(uniqueName("MCQ", used)).toBe("MCQ");
    expect(used.has("mcq")).toBe(true);
  });

  it("appends an incrementing suffix on collision (case-insensitive)", () => {
    const used = new Set(["mcq"]);
    expect(uniqueName("MCQ", used)).toBe("MCQ (2)");
    expect(uniqueName("MCQ", used)).toBe("MCQ (3)");
  });
});
