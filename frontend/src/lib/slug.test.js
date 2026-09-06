import { describe, it, expect } from "vitest";
import { slugify } from "./slug.js";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("SSC CGL")).toBe("ssc-cgl");
    expect(slugify("General Knowledge")).toBe("general-knowledge");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("Physics & Chemistry!!!")).toBe("physics-chemistry");
    expect(slugify("a   b___c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
    expect(slugify("!!!edge!!!")).toBe("edge");
  });

  it("handles nullish and empty input", () => {
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
    expect(slugify("")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});
