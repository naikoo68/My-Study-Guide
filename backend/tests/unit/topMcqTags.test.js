import { describe, it, expect } from "vitest";
import { topMcqTagNames, topMcqHashtags } from "../../src/utils/topMcqTags.js";
import { buildYtTags } from "../../src/config/youtube.js";

describe("Top MCQs of <subject> / <topic> tags", () => {
  const names = { subject: "Economics", topic: "Fiscal Policy of India" };
  it("readable YouTube tags", () => {
    expect(topMcqTagNames(names)).toEqual(["Top MCQs of Economics", "Top MCQs of Fiscal Policy of India"]);
    expect(topMcqTagNames({ subject: "A) JKSSB History", topic: "" })).toEqual(["Top MCQs of JKSSB History"]);
    expect(topMcqTagNames({ subject: "Ecology", topic: "ecology" })).toEqual(["Top MCQs of Ecology"]);
    expect(topMcqTagNames({})).toEqual([]);
  });
  it("visible hashtags", () => {
    expect(topMcqHashtags(names)).toBe("#TopMCQsOfEconomics #TopMCQsOfFiscalPolicyOfIndia");
  });
  it("go near the front of YouTube tags so the 500-char limit never cuts them", () => {
    const many = Array.from({ length: 80 }, (_, i) => `#LongHashtagNumber${i}`).join(" ");
    const tags = buildYtTags(many, { first: ["JKSSB", "Economics", ...topMcqTagNames(names)] });
    expect(tags.slice(0, 4)).toEqual(["JKSSB", "Economics", "Top MCQs of Economics", "Top MCQs of Fiscal Policy of India"]);
  });
});
