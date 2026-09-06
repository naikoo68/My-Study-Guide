import { describe, it, expect } from "vitest";
import {
  passwordProblem,
  isStrongPassword,
  generateStrongPassword,
} from "../../src/utils/passwordPolicy.js";

describe("passwordProblem", () => {
  it("accepts a valid mixed password (returns empty string)", () => {
    expect(passwordProblem("goodpass1")).toBe("");
  });

  it("rejects passwords shorter than the minimum", () => {
    expect(passwordProblem("ab1")).toMatch(/at least 8 characters/);
  });

  it("honours a custom minimum length", () => {
    expect(passwordProblem("abc123", { min: 10 })).toMatch(/at least 10 characters/);
    expect(passwordProblem("abcdefg123", { min: 10 })).toBe("");
  });

  it("requires at least one letter", () => {
    expect(passwordProblem("12345678")).toMatch(/at least one letter/);
  });

  it("requires at least one number", () => {
    expect(passwordProblem("abcdefgh")).toMatch(/at least one number/);
  });

  it("rejects known-weak defaults regardless of case/whitespace", () => {
    expect(passwordProblem("admin123")).toMatch(/too common/);
    expect(passwordProblem("  Password1  ")).toMatch(/too common/);
    expect(passwordProblem("CHANGEME")).toMatch(/at least one number/); // fails digit rule first
  });

  it("treats null/undefined as an empty (too short) password", () => {
    expect(passwordProblem(undefined)).toMatch(/at least 8 characters/);
    expect(passwordProblem(null)).toMatch(/at least 8 characters/);
  });
});

describe("isStrongPassword", () => {
  it("is true only when there is no problem", () => {
    expect(isStrongPassword("goodpass1")).toBe(true);
    expect(isStrongPassword("weak")).toBe(false);
    expect(isStrongPassword("admin123")).toBe(false);
  });
});

describe("generateStrongPassword", () => {
  it("always produces a password that passes the policy", () => {
    for (let i = 0; i < 25; i++) {
      expect(isStrongPassword(generateStrongPassword())).toBe(true);
    }
  });

  it("produces distinct values on each call", () => {
    const a = generateStrongPassword();
    const b = generateStrongPassword();
    expect(a).not.toBe(b);
  });
});
