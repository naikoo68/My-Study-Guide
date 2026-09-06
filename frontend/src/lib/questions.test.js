import { describe, it, expect } from "vitest";
import {
  displayOptions,
  ASSERTION_REASON_OPTIONS,
  questionDate,
  questionUpdatedDate,
  stemText,
  matchPercent,
  searchQuestions,
  questionTypeKey,
  filterByType,
} from "./questions.js";

describe("displayOptions", () => {
  it("returns the question's own options for a normal MCQ", () => {
    const q = { type: "mcq", options: ["a", "b", "c", "d"] };
    expect(displayOptions(q)).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back to the fixed A/R rubric for an assertion with blank options", () => {
    const q = { type: "assertion", options: ["", "", "", ""] };
    expect(displayOptions(q)).toEqual(ASSERTION_REASON_OPTIONS);
  });

  it("keeps real assertion options when all four are present", () => {
    const q = { type: "assertion", options: ["w", "x", "y", "z"] };
    expect(displayOptions(q)).toEqual(["w", "x", "y", "z"]);
  });
});

describe("questionDate", () => {
  it("prefers an explicit createdAt", () => {
    const d = questionDate({ createdAt: "2026-07-12T11:05:00Z" });
    expect(d.toISOString()).toBe("2026-07-12T11:05:00.000Z");
  });

  it("derives the date from a Mongo ObjectId when createdAt is absent", () => {
    // first 8 hex chars = 0x507f1f77 = 1350508407 seconds
    const d = questionDate({ _id: "507f1f77bcf86cd799439011" });
    expect(d.getTime()).toBe(1350508407 * 1000);
  });

  it("returns null when there is no usable date", () => {
    expect(questionDate({ _id: "not-an-object-id" })).toBeNull();
    expect(questionDate({})).toBeNull();
    expect(questionDate(null)).toBeNull();
  });
});

describe("questionUpdatedDate", () => {
  it("returns null when the update is within ~5s of creation (never edited)", () => {
    const item = {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:03.000Z",
    };
    expect(questionUpdatedDate(item)).toBeNull();
  });

  it("returns the update date when edited well after upload", () => {
    const item = {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    expect(questionUpdatedDate(item).toISOString()).toBe("2026-01-01T00:05:00.000Z");
  });

  it("returns null for missing/invalid updatedAt", () => {
    expect(questionUpdatedDate({})).toBeNull();
    expect(questionUpdatedDate({ updatedAt: "nonsense" })).toBeNull();
  });
});

describe("stemText", () => {
  it("returns the text unchanged for non-assertion questions", () => {
    expect(stemText({ type: "mcq", text: "What is 2+2?" })).toBe("What is 2+2?");
  });

  it("strips an embedded Assertion/Reason block, keeping the intro line", () => {
    const q = {
      type: "assertion",
      assertion: "Water boils at 100C",
      reason: "At sea-level pressure",
      text: "Consider the following:\nAssertion (A): Water boils at 100C\nReason (R): At sea-level pressure",
    };
    expect(stemText(q)).toBe("Consider the following:");
  });

  it("uses a default intro when the stem starts with the A/R block", () => {
    const q = {
      type: "assertion",
      assertion: "X",
      reason: "Y",
      text: "Assertion (A): X\nReason (R): Y",
    };
    expect(stemText(q)).toBe("Consider the following Assertion (A) and Reason (R):");
  });
});

describe("matchPercent", () => {
  const item = { text: "Photosynthesis occurs in the chloroplast of plants" };

  it("returns 0 for an empty query", () => {
    expect(matchPercent("", item)).toBe(0);
    expect(matchPercent("   ", item)).toBe(0);
  });

  it("returns 100 when the full phrase appears anywhere", () => {
    expect(matchPercent("chloroplast of plants", item)).toBe(100);
  });

  it("scores the share of meaningful words when not a full phrase", () => {
    // 'photosynthesis' matches, 'animals' does not -> 1/2 = 50%
    expect(matchPercent("photosynthesis animals", item)).toBe(50);
  });

  it("ignores option-label tokens and single letters", () => {
    // "(a)" and stray single letters are dropped; 'chloroplast' matches -> 100%
    expect(matchPercent("(a) chloroplast", item)).toBe(100);
  });
});

describe("searchQuestions", () => {
  const list = [
    { _id: "1", text: "The mitochondria is the powerhouse of the cell" },
    { _id: "2", text: "Photosynthesis happens in plants" },
    { _id: "3", text: "Newton's laws of motion" },
  ];

  it("returns null for an empty query", () => {
    expect(searchQuestions(list, "")).toBeNull();
    expect(searchQuestions(list, "   ")).toBeNull();
  });

  it("returns only 40%+ matches, sorted best-first, tagged with _match", () => {
    const res = searchQuestions(list, "mitochondria powerhouse");
    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res[0]._id).toBe("1");
    expect(res[0]._match).toBe(100);
    // Newton's laws should not appear for this query
    expect(res.find((r) => r._id === "3")).toBeUndefined();
  });

  it("sorts by descending match percentage", () => {
    const res = searchQuestions(list, "plants");
    const pcts = res.map((r) => r._match);
    expect(pcts).toEqual([...pcts].sort((a, b) => b - a));
  });
});

describe("questionTypeKey / filterByType", () => {
  it("collapses unknown types to mcq", () => {
    expect(questionTypeKey({ type: "assertion" })).toBe("assertion");
    expect(questionTypeKey({ type: "mystery" })).toBe("mcq");
    expect(questionTypeKey({})).toBe("mcq");
  });

  it("filters a list by selected type keys", () => {
    const list = [
      { _id: "1", type: "mcq" },
      { _id: "2", type: "assertion" },
      { _id: "3" }, // mcq
    ];
    const mcqs = filterByType(list, ["mcq"]);
    expect(mcqs.map((q) => q._id)).toEqual(["1", "3"]);
  });

  it("returns all items when no selection is given", () => {
    const list = [{ _id: "1", type: "mcq" }, { _id: "2", type: "assertion" }];
    expect(filterByType(list, [])).toEqual(list);
    expect(filterByType(list, undefined)).toEqual(list);
  });
});
