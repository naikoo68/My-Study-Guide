import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the plan-flags source so we can drive the paywall on/off deterministically
// without a DB. Defaults to plans ON (studentPlansEnabled: true), which matches
// the real cache default and keeps the hasActiveSubscription tests below valid.
vi.mock("../../src/utils/siteFlags.js", () => ({
  planFlagsSync: vi.fn(() => ({
    studentPlansEnabled: true,
    creatorPlansEnabled: true,
    institutePlansEnabled: true,
  })),
}));

import {
  findAccessEntry,
  isTestVisibleToUser,
  isSharedWithUser,
  hasActiveSubscription,
  studentPaywallOff,
} from "../../src/utils/accessControl.js";
import { planFlagsSync } from "../../src/utils/siteFlags.js";

beforeEach(() => {
  // Reset to the default (plans ON) before each test.
  planFlagsSync.mockReturnValue({
    studentPlansEnabled: true,
    creatorPlansEnabled: true,
    institutePlansEnabled: true,
  });
});

const HOUR = 60 * 60 * 1000;
const future = () => new Date(Date.now() + HOUR).toISOString();
const past = () => new Date(Date.now() - HOUR).toISOString();

describe("findAccessEntry", () => {
  it("finds an entry by user id (string-compared)", () => {
    const test = { access: [{ user: 1, visible: true }, { user: 2, visible: false }] };
    expect(findAccessEntry(test, "2")).toEqual({ user: 2, visible: false });
  });

  it("returns null when there is no user id or no match", () => {
    expect(findAccessEntry({ access: [] }, null)).toBeNull();
    expect(findAccessEntry({ access: [{ user: 9 }] }, "1")).toBeNull();
    expect(findAccessEntry({}, "1")).toBeNull();
  });
});

describe("isTestVisibleToUser", () => {
  it("respects an explicit visible:true entry", () => {
    const test = { visibleToAll: false, access: [{ user: "u1", visible: true }] };
    expect(isTestVisibleToUser(test, "u1")).toBe(true);
  });

  it("respects an explicit visible:false entry even when public", () => {
    const test = { visibleToAll: true, access: [{ user: "u1", visible: false }] };
    expect(isTestVisibleToUser(test, "u1")).toBe(false);
  });

  it("honours validUntil expiry on a granted entry", () => {
    const granted = { visibleToAll: false, access: [{ user: "u1", visible: true, validUntil: future() }] };
    const expired = { visibleToAll: false, access: [{ user: "u1", visible: true, validUntil: past() }] };
    expect(isTestVisibleToUser(granted, "u1")).toBe(true);
    expect(isTestVisibleToUser(expired, "u1")).toBe(false);
  });

  it("falls back to visibleToAll when there is no explicit entry", () => {
    expect(isTestVisibleToUser({ visibleToAll: true, access: [] }, "u1")).toBe(true);
    expect(isTestVisibleToUser({ visibleToAll: false, access: [] }, "u1")).toBe(false);
    expect(isTestVisibleToUser({ access: [] }, "u1")).toBe(false); // default hidden
  });
});

describe("isSharedWithUser", () => {
  it("is true when the user id is in sharedWith", () => {
    expect(isSharedWithUser({ sharedWith: ["a", "b"] }, "b")).toBe(true);
  });

  it("is false without a user id, empty list, or no match", () => {
    expect(isSharedWithUser({ sharedWith: ["a"] }, null)).toBe(false);
    expect(isSharedWithUser({ sharedWith: [] }, "a")).toBe(false);
    expect(isSharedWithUser({}, "a")).toBe(false);
    expect(isSharedWithUser(null, "a")).toBe(false);
  });
});

describe("hasActiveSubscription", () => {
  it("is true for a non-expired studentPlanExpiresAt", () => {
    expect(hasActiveSubscription({ studentPlanExpiresAt: future() })).toBe(true);
  });

  it("is false for an expired or missing expiry", () => {
    expect(hasActiveSubscription({ studentPlanExpiresAt: past() })).toBe(false);
    expect(hasActiveSubscription({})).toBe(false);
    expect(hasActiveSubscription(null)).toBe(false);
  });

  it("respects an active plan for a non-student role", () => {
    expect(hasActiveSubscription({ role: "admin", studentPlanExpiresAt: future() })).toBe(true);
  });

  it("frees a student site-wide when the student paywall is OFF, even without an expiry", () => {
    planFlagsSync.mockReturnValue({ studentPlansEnabled: false });
    expect(hasActiveSubscription({ role: "student" })).toBe(true);
  });
});

describe("studentPaywallOff", () => {
  it("is false when student plans are enabled (paywall ON)", () => {
    planFlagsSync.mockReturnValue({ studentPlansEnabled: true });
    expect(studentPaywallOff()).toBe(false);
  });

  it("is true when student plans are disabled (paywall OFF) — frees content for everyone incl. guests", () => {
    planFlagsSync.mockReturnValue({ studentPlansEnabled: false });
    expect(studentPaywallOff()).toBe(true);
  });
});
