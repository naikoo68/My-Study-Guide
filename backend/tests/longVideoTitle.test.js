import { describe, it, expect } from "vitest";
import { defaultLongVideoTitle, partNumberFor } from "../src/config/longVideo.js";
import { buildYtTitle, buildYtLongDescription } from "../src/config/youtube.js";

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
