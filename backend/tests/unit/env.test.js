import { describe, it, expect, afterEach, vi } from "vitest";
import { isDev, isTest, isProd, assertNodeEnv } from "../../src/utils/env.js";

const original = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = original;
  vi.restoreAllMocks();
});

describe("environment mode helpers", () => {
  it("isDev is true ONLY for an explicit 'development'", () => {
    process.env.NODE_ENV = "development";
    expect(isDev()).toBe(true);
    process.env.NODE_ENV = "production";
    expect(isDev()).toBe(false);
    delete process.env.NODE_ENV;
    expect(isDev()).toBe(false);
  });

  it("isTest is true ONLY for an explicit 'test'", () => {
    process.env.NODE_ENV = "test";
    expect(isTest()).toBe(true);
    process.env.NODE_ENV = "development";
    expect(isTest()).toBe(false);
  });

  it("isProd is the secure default (true unless dev or test)", () => {
    process.env.NODE_ENV = "production";
    expect(isProd()).toBe(true);
    delete process.env.NODE_ENV; // missing -> treated as production
    expect(isProd()).toBe(true);
    process.env.NODE_ENV = "totally-misspelled"; // unrecognised -> production
    expect(isProd()).toBe(true);
    process.env.NODE_ENV = "development";
    expect(isProd()).toBe(false);
    process.env.NODE_ENV = "test";
    expect(isProd()).toBe(false);
  });
});

describe("assertNodeEnv", () => {
  it("warns (never throws) when NODE_ENV is unset", () => {
    delete process.env.NODE_ENV;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertNodeEnv()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns on an unrecognised NODE_ENV value", () => {
    process.env.NODE_ENV = "staging";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertNodeEnv();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays silent for recognised values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const v of ["development", "production", "test"]) {
      process.env.NODE_ENV = v;
      assertNodeEnv();
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
