import { describe, it, expect } from "vitest";
import { featureEnabled, publicFeatureEnabled } from "./features.js";

describe("featureEnabled", () => {
  it("is true when there is no key", () => {
    expect(featureEnabled({}, "")).toBe(true);
    expect(featureEnabled({}, undefined)).toBe(true);
  });

  it("is true unless the flag is explicitly false", () => {
    expect(featureEnabled({ featureFlags: {} }, "leaderboard")).toBe(true);
    expect(featureEnabled({ featureFlags: { leaderboard: true } }, "leaderboard")).toBe(true);
    expect(featureEnabled({ featureFlags: { leaderboard: false } }, "leaderboard")).toBe(false);
  });

  it("is true when settings are missing entirely", () => {
    expect(featureEnabled(undefined, "leaderboard")).toBe(true);
  });
});

describe("publicFeatureEnabled", () => {
  it("is true when there is no key", () => {
    expect(publicFeatureEnabled({}, "")).toBe(true);
  });

  it("honours a plain public flag (default on, explicit false off)", () => {
    expect(publicFeatureEnabled({ publicFeatureFlags: {} }, "leaderboard")).toBe(true);
    expect(
      publicFeatureEnabled({ publicFeatureFlags: { leaderboard: false } }, "leaderboard")
    ).toBe(false);
  });

  it("treats per-kind practice flags independently", () => {
    const pf = { publicFeatureFlags: { practiceQuiz: true, practiceTest: false } };
    expect(publicFeatureEnabled(pf, "practiceQuiz")).toBe(true);
    expect(publicFeatureEnabled(pf, "practiceTest")).toBe(false);
    // 'practice' section is on if EITHER kind is enabled
    expect(publicFeatureEnabled(pf, "practice")).toBe(true);
  });

  it("falls back to the legacy single 'practice' flag when per-kind is unset", () => {
    const legacyOff = { publicFeatureFlags: { practice: false } };
    expect(publicFeatureEnabled(legacyOff, "practiceQuiz")).toBe(false);
    expect(publicFeatureEnabled(legacyOff, "practiceTest")).toBe(false);
    expect(publicFeatureEnabled(legacyOff, "practice")).toBe(false);

    const legacyOn = { publicFeatureFlags: { practice: true } };
    expect(publicFeatureEnabled(legacyOn, "practiceQuiz")).toBe(true);
  });

  it("defaults practice kinds to on when nothing is configured", () => {
    expect(publicFeatureEnabled({}, "practiceQuiz")).toBe(true);
    expect(publicFeatureEnabled({ publicFeatureFlags: {} }, "practiceTest")).toBe(true);
  });
});
