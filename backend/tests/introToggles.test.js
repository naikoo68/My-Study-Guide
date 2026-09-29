import { describe, it, expect } from "vitest";
import { introSlidePlan } from "../src/config/slidePlan.js";
import { normalizeTextBox } from "../src/config/youtube.js";

const names = { subject: "Economics", topic: "Characteristics and Problems of Developing Economy" };

describe("intro slide: Subject / Topic switches", () => {
  it("both on (default) → Subject — Topic", () => {
    const p = introSlidePlan(names);
    expect(p.heading).toBe("Economics — Characteristics and Problems of Developing Economy");
    expect(p.narration).toMatch(/^Economics — Characteristics.*Let's begin the quiz\.$/);
  });
  it("subject off → only the topic (shown and said)", () => {
    const p = introSlidePlan({ ...names, showSubject: false });
    expect(p.heading).toBe("Characteristics and Problems of Developing Economy");
    expect(p.narration).not.toMatch(/Economics\b(?! )/);
    expect(p.narration.startsWith("Characteristics")).toBe(true);
  });
  it("topic off → only the subject", () => {
    const p = introSlidePlan({ ...names, showTopic: false });
    expect(p.heading).toBe("Economics");
    expect(p.narration).toBe("Economics. Let's begin the quiz.");
  });
  it("both off → Quiz Time, no names", () => {
    const p = introSlidePlan({ ...names, showSubject: false, showTopic: false });
    expect(p.heading).toBe("Quiz Time");
    expect(p.narration).toBe("Let's begin the quiz.");
  });
  it("a typed narration line is kept as written", () => {
    expect(introSlidePlan({ ...names, showSubject: false, narration: "Welcome!" }).narration).toBe("Welcome!");
  });
  it("the switches are saved (on unless turned off)", () => {
    expect(normalizeTextBox({})).toMatchObject({ showSubject: true, showTopic: true });
    expect(normalizeTextBox({ showSubject: false })).toMatchObject({ showSubject: false, showTopic: true });
  });
});
