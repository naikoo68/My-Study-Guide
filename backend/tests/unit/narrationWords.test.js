import { describe, it, expect } from "vitest";
import { toSpeech, dropBracketGlosses, speakRomanNumerals, dropAssertionReasonMarks, buildSlidePlan, isRomanisedGloss } from "../../src/config/slidePlan.js";

describe("Hindi in brackets is not narrated", () => {
  it("drops Devanagari glosses", () => {
    expect(toSpeech("Concrete Technology (कंक्रीट प्रौद्योगिकी)")).toBe("Concrete Technology");
    expect(toSpeech("cash book [रोकड़ बही] entry")).toBe("cash book entry");
  });
  it("drops romanised glosses written as math", () => {
    expect(toSpeech("recorded in the cash book ($Rokar-bahi$) to reflect")).toBe("recorded in the cash book to reflect");
    expect(toSpeech("Adjusting entry ($Samayojanpravishti$)")).toBe("Adjusting entry");
    expect(toSpeech("Contra entry $(Vipreetpravishti)$")).toBe("Contra entry");
  });
  it("keeps normal English brackets and real math", () => {
    expect(dropBracketGlosses("interfacial transition zone (ITZ)")).toBe("interfacial transition zone (ITZ)");
    expect(dropBracketGlosses("area ($\\pi r^2$)")).toBe("area ($\\pi r^2$)");
    expect(dropBracketGlosses("value ($x$)")).toBe("value ($x$)");
  });
});

describe("Roman numerals are read as numbers", () => {
  it("statements and lists", () => {
    expect(speakRomanNumerals("Which of the statements I and II are correct?")).toBe("Which of the statements 1 and 2 are correct?");
    expect(speakRomanNumerals("I, II and III only")).toBe("1, 2 and 3 only");
    expect(speakRomanNumerals("Both I and II")).toBe("Both 1 and 2");
    expect(speakRomanNumerals("I only")).toBe("1 only");
    expect(speakRomanNumerals("Only I")).toBe("Only 1");
    expect(speakRomanNumerals("Statement I is correct")).toBe("Statement 1 is correct");
    expect(speakRomanNumerals("1-I, 2-IV, 3-II")).toBe("1-1, 2-4, 3-2");
    expect(speakRomanNumerals("World War II and Type I diabetes")).toBe("World War 2 and Type 1 diabetes");
    expect(speakRomanNumerals("(ii) and (iv)")).toBe("(2) and (4)");
  });
  it("leaves the pronoun I and the letters V / X alone", () => {
    expect(speakRomanNumerals("I think you and I agree")).toBe("I think you and I agree");
    expect(speakRomanNumerals("V = IR and X-ray")).toBe("V = IR and X-ray");
    expect(speakRomanNumerals("Vitamin A")).toBe("Vitamin A");
  });
});

describe("Assertion (A) / Reason (R) markers", () => {
  it("are not read in the question", () => {
    expect(dropAssertionReasonMarks("Assertion (A): Plants make food. Reason (R): They have chlorophyll.")).toBe("Assertion: Plants make food. Reason: They have chlorophyll.");
    expect(dropAssertionReasonMarks("Consider the following Assertion (A) and Reason (R):")).toBe("Consider the following Assertion and Reason:");
    expect(dropAssertionReasonMarks("(A) Plants make food\n(R): They have chlorophyll")).toBe("Plants make food\nThey have chlorophyll");
  });
  it("question narration skips them, options keep A and R", () => {
    const q = {
      type: "assertion", text: "Consider the following Assertion (A) and Reason (R):",
      assertion: "Plants make food (A).", reason: "They have chlorophyll.",
      options: ["Both A and R are true and R is the correct explanation of A", "A is true but R is false", "A is false but R is true", "Both A and R are false"],
      correctAnswer: 0,
    };
    const [slide] = buildSlidePlan(q, { index: 1, total: 1, read: { question: true, options: true } });
    const n = slide.narration;
    expect(n).toContain("Consider the following Assertion and Reason.");
    expect(n).not.toMatch(/Assertion \(A\)|Reason \(R\)|Assertion A\b|Reason R\b/);
    expect(n).toContain("Both A and R are true and R is the correct explanation of A");
  });
});

describe("Hindi meanings in English letters (plain brackets)", () => {
  it("are skipped", () => {
    expect(toSpeech("Deficit Budget (Ghata Budget)")).toBe("Deficit Budget");
    expect(toSpeech("Balanced Budget (Santulit Budget)")).toBe("Balanced Budget");
    expect(toSpeech("Surplus Budget (Bachat Budget)")).toBe("Surplus Budget");
    expect(toSpeech("Zero-Based Budget (Shunya Adharit Budget)")).toBe("Zero-Based Budget");
    expect(toSpeech("recorded in the cash book (Rokar bahi) to reflect")).toBe("recorded in the cash book to reflect");
  });
  it("real English brackets are still read", () => {
    expect(toSpeech("total receipts (excluding borrowings), the budget")).toBe("total receipts (excluding borrowings), the budget");
    expect(toSpeech("interfacial transition zone (ITZ)")).toBe("interfacial transition zone (ITZ)");
    expect(toSpeech("the cell (mitochondria)")).toBe("the cell (mitochondria)");
    expect(toSpeech("marks (25 marks)")).toBe("marks (25 marks)");
    expect(isRomanisedGloss("Contra entry")).toBe(false);
  });
});
