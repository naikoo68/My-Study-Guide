import { describe, it, expect } from "vitest";
import {
  findAccessEntry,
  isTestVisibleToUser,
  isSharedWithUser,
  hasActiveSubscription,
} from "../../src/utils/accessControl.js";

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
});
