import Settings from "../models/Settings.js";
import Tenant from "../models/Tenant.js";
import { getCurrentTenantId, runUnscoped } from "./tenantContext.js";

// Resolve the SAME "site" Settings record the admin panel reads & writes
// (mirrors settingsController.findSite: current tenant → default tenant →
// legacy null-tenant → any), running UNSCOPED so the tenant plugin can't
// silently redirect the read to a different record.
//
// Why this exists: with TENANT_ENFORCEMENT=on and MORE THAN ONE "site" record
// (e.g. a legacy null-tenant doc plus a default-tenant doc after the Oracle
// migration), a naive `Settings.findOne({ key: "site" })` could match the WRONG
// record — one with no plans — and wrongly fall back to the built-in defaults.
// That made admin-saved plans never appear on the public pricing/registration
// pages no matter what was saved. Reading the exact record the admin writes to
// fixes that.
export async function findSiteSettings(select) {
  const tid = getCurrentTenantId(); // capture BEFORE unscoping (runUnscoped nulls it)
  return runUnscoped(async () => {
    if (tid) {
      const s = await Settings.findOne({ key: "site", tenantId: tid }).select(select).lean();
      if (s) return s;
    }
    const def = await Tenant.findOne({ isDefault: true }).select("_id").lean();
    if (def) {
      const s = await Settings.findOne({ key: "site", tenantId: def._id }).select(select).lean();
      if (s) return s;
    }
    const legacy = await Settings.findOne({ key: "site", tenantId: null }).select(select).lean();
    if (legacy) return legacy;
    return Settings.findOne({ key: "site" }).select(select).lean();
  });
}

// Default client subscription plans (used until an admin edits them in the
// panel). Each plan carries BOTH its pricing (label/months/price) AND its AI
// generation limits (maxPerBatch + perWindow per windowMinutes). Prices match
// the original hard-coded plans so nothing reprices on first deploy.
export const DEFAULT_CLIENT_PLANS = [
  { key: "trial", label: "1-Day Free Trial", cycle: "Trial", months: 0, days: 1, price: 0, trial: true, maxPerBatch: 50, perWindow: 50, windowMinutes: 5 },
  { key: "1m", label: "1 Month", cycle: "Monthly", months: 1, price: 299, maxPerBatch: 50, perWindow: 100, windowMinutes: 5 },
  { key: "2m", label: "2 Months", cycle: "Monthly", months: 2, price: 499, maxPerBatch: 100, perWindow: 200, windowMinutes: 5 },
  { key: "6m", label: "6 Months", cycle: "Semi-Annually", months: 6, price: 699, maxPerBatch: 200, perWindow: 400, windowMinutes: 5 },
  { key: "1y", label: "1 Year", cycle: "Yearly", months: 12, price: 899, maxPerBatch: 500, perWindow: 1000, windowMinutes: 5 },
];

// Default STUDENT subscription plans (used until an admin edits them in the
// panel). Students don't get the AI generator, so these carry ONLY pricing
// (label/months/price) — no AI limits. Prices per the product spec.
export const DEFAULT_STUDENT_PLANS = [
  { key: "trial", label: "1-Day Free Trial", cycle: "Trial", months: 0, days: 1, price: 0, trial: true },
  { key: "1m", label: "1 Month", cycle: "Monthly", months: 1, price: 149 },
  { key: "3m", label: "3 Months", cycle: "Quarterly", months: 3, price: 399 },
  { key: "6m", label: "6 Months", cycle: "Semi-Annually", months: 6, price: 699 },
  { key: "1y", label: "1 Year", cycle: "Yearly", months: 12, price: 899 },
];

// Default INSTITUTE (tenant) subscription plans — what an institute pays to run
// its own space on the platform. Pricing only; admin-editable. The trial grants
// TRIAL_TENANT_DAYS of access (see instituteSignupController). Placeholder
// prices — the super-admin edits them in Admin → Plans → Institute Plans.
export const DEFAULT_TENANT_PLANS = [
  { key: "trial", label: "14-Day Free Trial", cycle: "Trial", months: 0, days: 14, price: 0, trial: true },
  { key: "1m", label: "1 Month", cycle: "Monthly", months: 1, price: 1499 },
  { key: "6m", label: "6 Months", cycle: "Semi-Annually", months: 6, price: 6999 },
  { key: "1y", label: "1 Year", cycle: "Yearly", months: 12, price: 11999 },
];

// The admin-managed client plans (from Settings), or the defaults if none saved.
export async function getClientPlans() {
  try {
    const s = await findSiteSettings("clientPlans");
    if (Array.isArray(s?.clientPlans) && s.clientPlans.length) return s.clientPlans;
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_CLIENT_PLANS;
}

// The admin-managed student plans (from Settings), or the defaults if none saved.
export async function getStudentPlans() {
  try {
    const s = await findSiteSettings("studentPlans");
    if (Array.isArray(s?.studentPlans) && s.studentPlans.length) return s.studentPlans;
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_STUDENT_PLANS;
}

// The admin-managed institute (tenant) plans (from Settings), or the defaults.
export async function getTenantPlans() {
  try {
    const s = await findSiteSettings("tenantPlans");
    if (Array.isArray(s?.tenantPlans) && s.tenantPlans.length) return s.tenantPlans;
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_TENANT_PLANS;
}

// Resolve the plan catalog for an audience:
//   "student" → student plans, "tenant" → institute plans,
//   anything else → client plans (the historical default).
export async function getPlansFor(audience) {
  if (audience === "student") return getStudentPlans();
  if (audience === "tenant") return getTenantPlans();
  return getClientPlans();
}

export function findPlan(plans, key) {
  return (plans || []).find((p) => p.key === key) || null;
}

// Free-trial length (in whole days) for a plan. Uses the admin-configured
// `days` when it's a positive number, otherwise the supplied fallback (the
// historical hard-coded default for that audience). Guards against bad input.
export function trialDays(plan, fallback = 1) {
  const n = Number(plan?.days);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
