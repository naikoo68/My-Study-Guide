import { describe, it, expect } from "vitest";
import { defaultLongVideoTitle, partNumberFor, streamFromLabel } from "../src/config/longVideo.js";
import { buildYtTitle, buildYtLongDescription, thumbnailLines } from "../src/config/youtube.js";

const V = { subject: "Economics", topic: "Characteristics and Problems of Developing Economy", quiz: "Quiz 1", count: 25 };
const title = ({ isPart, part = 1, vars = V }) =>
  buildYtTitle(defaultLongVideoTitle({ isPart, hasQuiz: !!vars.quiz }).replace(/\{part\}/g, String(part)), vars, "Quiz");

describe("long-video titles", () => {
  it("part of a 50-question quiz → Quiz 1 (Part 1) (25 Questions)", () => {
    expect(title({ isPart: true, part: partNumberFor(1, 25) })).toBe("Economics | Characteristics and Problems of Developing Economy | Quiz 1 (Part 1) (25 Questions)");
    expect(title({ isPart: true, part: partNumberFor(26, 25) })).toBe("Economics | Characteristics and Problems of Developing Economy | Quiz 1 (Part 2) (25 Questions)");
  });
  it("the whole quiz in one video → Quiz 1 (25 Questions), never 'Full Quiz'", () => {
    const t = title({ isPart: false });
    expect(t).toBe("Economics | Characteristics and Problems of Developing Economy | Quiz 1 (25 Questions)");
    expect(t).not.toMatch(/Full Quiz/i);
  });
  it("a whole topic (no single quiz) drops the quiz name", () => {
    expect(title({ isPart: true, part: 2, vars: { ...V, quiz: "" } })).toBe("Economics | Characteristics and Problems of Developing Economy (Part 2) (25 Questions)");
    expect(title({ isPart: false, vars: { ...V, quiz: "" } })).toBe("Economics | Characteristics and Problems of Developing Economy (25 Questions)");
  });
  it("a shorter last part keeps the right number", () => {
    expect(partNumberFor(41, 20)).toBe(3);
    expect(partNumberFor(1, 20)).toBe(1);
  });
});

describe("long-video description", () => {
  it("starts with the title, then the intro", () => {
    const d = buildYtLongDescription({ title: "Economics | Topic | Quiz 1 (Part 1) (25 Questions)", intro: "25 questions with answers.", hashtags: "#x" });
    expect(d.split("\n").slice(0, 3)).toEqual(["Economics | Topic | Quiz 1 (Part 1) (25 Questions)", "", "25 questions with answers."]);
  });
});

describe("stream name", () => {
  it("is the first part of the default titles (and dropped when unknown)", () => {
    const vars = { stream: "Civil Engineering", subject: "Concrete Technology", topic: "Constituent Materials", quiz: "Quiz 1", count: 25 };
    expect(title({ isPart: false, vars })).toBe("Civil Engineering | Concrete Technology | Constituent Materials | Quiz 1 (25 Questions)");
    expect(title({ isPart: false })).toBe("Economics | Characteristics and Problems of Developing Economy | Quiz 1 (25 Questions)");
    expect(buildYtTitle("", { stream: "CE", subject: "Concrete", topic: "Materials", n: 3 })).toBe("CE | Concrete | Materials | Quiz 3");
  });
  it("too long → the quiz part is kept whole", () => {
    const t = title({ isPart: true, part: 2, vars: { ...V, stream: "Junior Engineer Civil Engineering Complete Preparation" } });
    expect(t.length).toBeLessThanOrEqual(100);
    expect(t.endsWith("Quiz 1 (Part 2) (25 Questions)")).toBe(true);
  });
  it("comes from the picked label only when it matches the subject", () => {
    expect(streamFromLabel("A) Civil Engineering › Concrete Technology › Constituent Materials › Quiz 1", "Concrete Technology")).toBe("Civil Engineering");
    expect(streamFromLabel("My Quiz › Pharmacy › Biopharmaceutics › Intro", "Biopharmaceutics")).toBe("Pharmacy");
    expect(streamFromLabel("Civil › Other Subject", "Concrete Technology")).toBe("");
  });
  it("thumbnail kicker = Stream · Subject", () => {
    expect(thumbnailLines({ stream: "Civil Engineering", subject: "Concrete Technology", topic: "Constituent Materials", quiz: "Quiz 1", count: 25 }).kicker).toBe("Civil Engineering · Concrete Technology");
    expect(thumbnailLines({ subject: "Concrete Technology", topic: "Constituent Materials" }).kicker).toBe("Concrete Technology");
  });
});
