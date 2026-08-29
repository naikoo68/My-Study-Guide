import Settings from "../models/Settings.js";
import { getCurrentTenantId, runUnscoped } from "./tenantContext.js";

// Cached, SYNCHRONOUS access to the per-audience plan toggles
// (studentPlansEnabled / creatorPlansEnabled / institutePlansEnabled).
//
// The access-control helpers that decide the paywall (hasActiveSubscription,
// studentSubscriptionActive) are synchronous and run on every content request,
// so we can't hit the database inside them. Instead we keep a tiny in-memory
// cache of the flags per tenant, refreshed lazily with a short TTL. A slightly
// stale read is fine: worst case, flipping a toggle takes up to TTL_MS to take
// effect everywhere. The cache is warmed on module load and on the health-check
// sweep so a freshly-started process picks up the current values quickly.

const TTL_MS = 30 * 1000;
const DEFAULTS = Object.freeze({
  studentPlansEnabled: true,
  creatorPlansEnabled: true,
  institutePlansEnabled: true,
});

const cache = new Map(); // key -> { at: number, flags: {...} }
const keyFor = (tenantId) => (tenantId ? String(tenantId) : "__none__");

// Load the flags for a tenant (or the single-site doc when tenantId is falsy)
// and store them in the cache. Never throws — on error we keep the last value.
export async function refreshPlanFlags(tenantId = getCurrentTenantId()) {
  try {
    const query = tenantId ? { key: "site", tenantId } : { key: "site" };
    const s = await runUnscoped(() =>
      Settings.findOne(query)
        .select("studentPlansEnabled creatorPlansEnabled institutePlansEnabled")
        .lean()
    );
    cache.set(keyFor(tenantId), {
      at: Date.now(),
      flags: {
        studentPlansEnabled: s?.studentPlansEnabled !== false,
        creatorPlansEnabled: s?.creatorPlansEnabled !== false,
        institutePlansEnabled: s?.institutePlansEnabled !== false,
      },
    });
  } catch {
    /* keep whatever we had; sync callers fall back to DEFAULTS */
  }
}

// Synchronous read used by the paywall helpers. Returns the last-known flags for
// the tenant, kicking off a background refresh when the entry is missing/stale.
export function planFlagsSync(tenantId = getCurrentTenantId()) {
  const hit = cache.get(keyFor(tenantId));
  if (!hit || Date.now() - hit.at > TTL_MS) {
    refreshPlanFlags(tenantId); // fire-and-forget; returns best-known value now
  }
  return hit ? hit.flags : DEFAULTS;
}

// Warm the single-site (no explicit tenant) flags at startup.
refreshPlanFlags(null);
