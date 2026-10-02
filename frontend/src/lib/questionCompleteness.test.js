import { describe, it, expect } from "vitest";
import { questionIssues } from "./questionCompleteness.js";

// "Find Incomplete": only ONE pair / statement is incomplete — 2 or more are fine.
const base = { text: "Consider the following:", options: ["a", "b", "c", "d"], correct: 1 };
describe("Find Incomplete — pair / statement count", () => {
  it("2 pairs are complete, 1 pair is not", () => {
    expect(questionIssues({ ...base, type: "pair", columnA: ["Market economy", "Planned economy"], columnB: ["Free market", "Central authority"] })).toEqual([]);
    expect(questionIssues({ ...base, type: "pair", columnA: ["A"], columnB: ["B"] })).toContain("Only one pair — needs at least 2");
    expect(questionIssues({ ...base, type: "matching", columnA: ["A"], columnB: ["B"] })).toContain("Only one pair — needs at least 2");
  });
  it("2 statements are complete, 1 is not", () => {
    expect(questionIssues({ ...base, type: "statement", columnA: ["One", "Two"] })).toEqual([]);
    expect(questionIssues({ ...base, type: "statement", columnA: ["Only one"] })).toContain("Only one statement — needs at least 2");
  });
});
