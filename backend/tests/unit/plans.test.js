import { describe, it, expect } from "vitest";
import {
  findPlan,
  trialDays,
  DEFAULT_CLIENT_PLANS,
  DEFAULT_STUDENT_PLANS,
  DEFAULT_TENANT_PLANS,
} from "../../src/utils/plans.js";

// NOTE: only the PURE helpers/constants are tested here. The getClientPlans /
// getStudentPlans / getTenantPlans / findSiteSettings functions read the DB
// (Mongoose) and are covered by the integration suite, not these fast units.

describe("findPlan", () => {
  const plans = [
    { key: "1m", price: 299 },
    { key: "1y", price: 899 },
  ];
  it("finds a plan by key", () => {
    expect(findPlan(plans, "1y")).toEqual({ key: "1y", price: 899 });
  });
  it("returns null when missing or the list is empty/nullish", () => {
    expect(findPlan(plans, "nope")).toBeNull();
    expect(findPlan([], "1m")).toBeNull();
    expect(findPlan(null, "1m")).toBeNull();
  });
});

describe("trialDays", () => {
  it("uses a positive configured days value (floored)", () => {
    expect(trialDays({ days: 14 })).toBe(14);
    expect(trialDays({ days: 3.9 })).toBe(3);
  });
  it("falls back when days is missing, zero, negative or non-numeric", () => {
    expect(trialDays({})).toBe(1);
    expect(trialDays({ days: 0 })).toBe(1);
    expect(trialDays({ days: -5 })).toBe(1);
    expect(trialDays({ days: "abc" })).toBe(1);
    expect(trialDays(null)).toBe(1);
  });
  it("honours a custom fallback", () => {
    expect(trialDays({}, 14)).toBe(14);
  });
});

describe("default plan catalogs", () => {
  const catalogs = {
    client: DEFAULT_CLIENT_PLANS,
    student: DEFAULT_STUDENT_PLANS,
    tenant: DEFAULT_TENANT_PLANS,
  };
  it("each catalog is a non-empty list that starts with a free trial", () => {
    for (const [name, list] of Object.entries(catalogs)) {
      expect(Array.isArray(list), name).toBe(true);
      expect(list.length, name).toBeGreaterThan(0);
      const trial = list.find((p) => p.key === "trial");
      expect(trial, `${name} has a trial plan`).toBeTruthy();
      expect(trial.price, `${name} trial is free`).toBe(0);
      expect(trial.trial).toBe(true);
    }
  });
  it("every plan has a key, label and numeric price", () => {
    for (const [name, list] of Object.entries(catalogs)) {
      for (const p of list) {
        expect(typeof p.key, name).toBe("string");
        expect(typeof p.label, name).toBe("string");
        expect(typeof p.price, name).toBe("number");
      }
    }
  });
  it("client plans carry AI generation limits; student plans do not", () => {
    expect(DEFAULT_CLIENT_PLANS.find((p) => p.key === "1m").maxPerBatch).toBeGreaterThan(0);
    expect(DEFAULT_STUDENT_PLANS.find((p) => p.key === "1m").maxPerBatch).toBeUndefined();
  });
});
