import { describe, it, expect } from "vitest";
import { INSTITUTE_FEATURES, featureEnabled } from "./instituteFeatures.js";

describe("INSTITUTE_FEATURES catalog", () => {
  it("is a non-empty list of { key, label } entries", () => {
    expect(Array.isArray(INSTITUTE_FEATURES)).toBe(true);
    expect(INSTITUTE_FEATURES.length).toBeGreaterThan(0);
    for (const f of INSTITUTE_FEATURES) {
      expect(typeof f.key).toBe("string");
      expect(typeof f.label).toBe("string");
    }
  });

  it("has unique keys", () => {
    const keys = INSTITUTE_FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes some expected toggles", () => {
    const keys = INSTITUTE_FEATURES.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["content", "tests", "practice", "aiGenerator"]));
  });
});

describe("featureEnabled", () => {
  it("is true when there is no key", () => {
    expect(featureEnabled({}, "")).toBe(true);
    expect(featureEnabled({ content: false }, undefined)).toBe(true);
  });

  it("is true when the institute has no feature map", () => {
    expect(featureEnabled(undefined, "content")).toBe(true);
    expect(featureEnabled(null, "content")).toBe(true);
  });

  it("is true unless the feature is explicitly false", () => {
    expect(featureEnabled({ content: true }, "content")).toBe(true);
    expect(featureEnabled({}, "content")).toBe(true);
    expect(featureEnabled({ content: false }, "content")).toBe(false);
  });
});
