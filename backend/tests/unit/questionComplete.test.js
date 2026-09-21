import { describe, it, expect } from "vitest";
import { isQuestionComplete } from "../../src/utils/questionComplete.js";

// A fully-valid MCQ we can clone and then break in each test.
const goodMcq = () => ({
  type: "mcq",
  text: "Which vitamin is ascorbic acid?",
  options: ["Vitamin A", "Vitamin B", "Vitamin C", "Vitamin D"],
  correct: 2,
});

describe("isQuestionComplete — MCQ", () => {
  it("accepts a complete MCQ", () => {
    expect(isQuestionComplete(goodMcq())).toEqual({ ok: true });
  });

  it("rejects a missing/blank stem", () => {
    const r = isQuestionComplete({ ...goodMcq(), text: "   " });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/question text/);
  });

  it("rejects when an option is blank (the reported 'missing options' case)", () => {
    const r = isQuestionComplete({ ...goodMcq(), options: ["A", "", "C", "D"] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/options/);
  });

  it("rejects when there are no options at all", () => {
    const r = isQuestionComplete({ ...goodMcq(), options: [] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/options/);
  });

  it("rejects a missing / out-of-range correct index", () => {
    expect(isQuestionComplete({ ...goodMcq(), correct: undefined }).ok).toBe(false);
    expect(isQuestionComplete({ ...goodMcq(), correct: 9 }).ok).toBe(false);
    expect(isQuestionComplete({ ...goodMcq(), correct: -1 }).ok).toBe(false);
  });
});

describe("isQuestionComplete — statement", () => {
  const base = () => ({ ...goodMcq(), type: "statement", columnA: ["Statement 1", "Statement 2"] });

  it("accepts a statement question with statements", () => {
    expect(isQuestionComplete(base()).ok).toBe(true);
  });

  it("rejects when the statements list is missing", () => {
    const r = isQuestionComplete({ ...base(), columnA: undefined });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/statements/);
  });

  it("rejects when a statement entry is blank", () => {
    const r = isQuestionComplete({ ...base(), columnA: ["Statement 1", ""] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/statements/);
  });
});

describe("isQuestionComplete — matching / pair", () => {
  const base = () => ({ ...goodMcq(), type: "matching", columnA: ["a", "b"], columnB: ["x", "y"] });

  it("accepts when BOTH columns are present", () => {
    expect(isQuestionComplete(base()).ok).toBe(true);
  });

  it("rejects when column A is missing", () => {
    const r = isQuestionComplete({ ...base(), columnA: [] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/column A/);
  });

  it("rejects when column B is missing", () => {
    const r = isQuestionComplete({ ...base(), columnB: undefined });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/column B/);
  });
});

describe("isQuestionComplete — assertion / reason", () => {
  const base = () => ({ ...goodMcq(), type: "assertion", assertion: "A holds.", reason: "Because R." });

  it("accepts when both assertion and reason are present", () => {
    expect(isQuestionComplete(base()).ok).toBe(true);
  });

  it("rejects a missing assertion", () => {
    const r = isQuestionComplete({ ...base(), assertion: "" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/assertion/);
  });

  it("rejects a missing reason", () => {
    const r = isQuestionComplete({ ...base(), reason: "   " });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/reason/);
  });
});

describe("isQuestionComplete — table", () => {
  const base = () => ({ ...goodMcq(), type: "table", tableRows: [["H1", "H2"], ["a", "b"]] });

  it("accepts a filled table", () => {
    expect(isQuestionComplete(base()).ok).toBe(true);
  });

  it("rejects an empty / blank-cell table", () => {
    expect(isQuestionComplete({ ...base(), tableRows: [] }).ok).toBe(false);
    expect(isQuestionComplete({ ...base(), tableRows: [["H1", ""]] }).ok).toBe(false);
  });
});

describe("isQuestionComplete — guards", () => {
  it("rejects nullish / non-object input", () => {
    expect(isQuestionComplete(null).ok).toBe(false);
    expect(isQuestionComplete(undefined).ok).toBe(false);
    expect(isQuestionComplete("nope").ok).toBe(false);
  });

  it("lists every missing piece in the reason", () => {
    const r = isQuestionComplete({ type: "assertion", text: "", options: [], assertion: "", reason: "" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/question text/);
    expect(r.reason).toMatch(/options/);
    expect(r.reason).toMatch(/assertion/);
    expect(r.reason).toMatch(/reason/);
  });
});
