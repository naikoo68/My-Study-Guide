import { describe, it, expect } from "vitest";
import { toSpeech, dropBracketGlosses, speakRomanNumerals } from "../../src/config/slidePlan.js";

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
