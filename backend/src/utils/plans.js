import Settings from "../models/Settings.js";

// Default client subscription plans (used until an admin edits them in the
// panel). Each plan carries BOTH its pricing (label/months/price) AND its AI
// generation limits (maxPerBatch + perWindow per windowMinutes). Prices match
// the original hard-coded plans so nothing reprices on first deploy.
export const DEFAULT_CLIENT_PLANS = [
  { key: "trial", label: "1-Day Free Trial", cycle: "Trial", months: 0, price: 0, trial: true, maxPerBatch: 20, perWindow: 20, windowMinutes: 5 },
  { key: "1m", label: "1 Month", cycle: "Monthly", months: 1, price: 299, maxPerBatch: 50, perWindow: 100, windowMinutes: 5 },
  { key: "2m", label: "2 Months", cycle: "Monthly", months: 2, price: 499, maxPerBatch: 100, perWindow: 200, windowMinutes: 5 },
  { key: "6m", label: "6 Months", cycle: "Semi-Annually", months: 6, price: 699, maxPerBatch: 200, perWindow: 400, windowMinutes: 5 },
  { key: "1y", label: "1 Year", cycle: "Yearly", months: 12, price: 899, maxPerBatch: 500, perWindow: 1000, windowMinutes: 5 },
];

// The admin-managed client plans (from Settings), or the defaults if none saved.
export async function getClientPlans() {
  try {
    const s = await Settings.findOne({ key: "site" }).select("clientPlans").lean();
    if (Array.isArray(s?.clientPlans) && s.clientPlans.length) return s.clientPlans;
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_CLIENT_PLANS;
}

export function findPlan(plans, key) {
  return (plans || []).find((p) => p.key === key) || null;
}
