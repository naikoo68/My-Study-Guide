import { describe, it, expect } from "vitest";
import {
  questionLocation,
  contentOfBlock,
  splitIntoStems,
} from "../../src/controllers/contentController.js";

// Pure, DB-free helpers exported from contentController.

describe("questionLocation", () => {
  it("labels practice-quiz test-series", () => {
    expect(questionLocation({ testSeries: { practice: true, practiceKind: "quiz", name: "Algebra Set" } }))
      .toBe("Practice Quiz: Algebra Set");
  });
  it("labels practice-test test-series", () => {
    expect(questionLocation({ testSeries: { practice: true, practiceKind: "test", name: "Mock 1" } }))
      .toBe("Practice Test: Mock 1");
  });
  it("labels a public test series", () => {
    expect(questionLocation({ testSeries: { practice: false, name: "SSC CGL" } }))
      .toBe("Public Test Series: SSC CGL");
  });
  it("falls back to 'Untitled' when a test series has no name", () => {
    expect(questionLocation({ testSeries: { practice: true, practiceKind: "quiz" } }))
      .toBe("Practice Quiz: Untitled");
  });
  it("builds a breadcrumb from the content tree when there is no test series", () => {
    const q = {
      subject: { name: "Physics", stream: { name: "NEET" } },
      session: { topic: { title: "Optics" } },
      quiz: { title: "Lenses" },
    };
    expect(questionLocation(q)).toBe("NEET › Physics › Optics › Lenses");
  });
  it("uses the plain topic string when there is no session topic", () => {
    expect(questionLocation({ subject: { name: "Maths" }, topic: "Algebra", quiz: { title: "Q1" } }))
      .toBe("Maths › Algebra › Q1");
  });
  it("returns 'Quiz' when nothing is known", () => {
    expect(questionLocation({})).toBe("Quiz");
  });
});

describe("contentOfBlock", () => {
  it("keeps the stem and options but drops answer/explanation lines", () => {
    const block = "What is 2+2?\nA) 3\nB) 4\nAnswer: B\nExplanation: basic addition";
    expect(contentOfBlock(block)).toBe("What is 2+2? A) 3 B) 4");
  });
  it("drops 'Correct'/'Solution' lines too", () => {
    const block = "Capital of France?\nA) Paris\nCorrect: A\nSolution: it is Paris";
    expect(contentOfBlock(block)).toBe("Capital of France? A) Paris");
  });
  it("returns '' for empty/nullish input", () => {
    expect(contentOfBlock("")).toBe("");
    expect(contentOfBlock(null)).toBe("");
  });
});

describe("splitIntoStems", () => {
  it("splits an explicitly numbered list", () => {
    const text = "1. What is the capital of India?\n2. Who wrote the national anthem?";
    const stems = splitIntoStems(text).map((x) => x.stem);
    expect(stems).toEqual([
      "What is the capital of India?",
      "Who wrote the national anthem?",
    ]);
  });

  it("falls back to blank-line separation when unnumbered", () => {
    const text = "Explain Newton's first law of motion.\n\nDefine kinetic energy clearly.";
    const stems = splitIntoStems(text).map((x) => x.stem);
    expect(stems).toEqual([
      "Explain Newton's first law of motion.",
      "Define kinetic energy clearly.",
    ]);
  });

  it("strips option lines from the stem but keeps them in the block", () => {
    // (Unnumbered block, so the leading-number detector doesn't interfere.)
    const items = splitIntoStems("Which of these is a prime number?\nA) 4\nB) 7");
    expect(items).toHaveLength(1);
    expect(items[0].stem).toBe("Which of these is a prime number?");
    expect(items[0].block).toContain("A) 4");
  });

  it("ignores stems shorter than 8 characters", () => {
    expect(splitIntoStems("1. Hi\n2. No")).toEqual([]);
  });

  it("returns [] for empty/nullish input", () => {
    expect(splitIntoStems("")).toEqual([]);
    expect(splitIntoStems(null)).toEqual([]);
  });

  it("treats a single unnumbered paragraph as one question", () => {
    const items = splitIntoStems("Describe the water cycle in detail.");
    expect(items).toHaveLength(1);
    expect(items[0].stem).toBe("Describe the water cycle in detail.");
  });
});
