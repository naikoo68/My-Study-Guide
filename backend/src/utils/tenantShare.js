import Tenant from "../models/Tenant.js";
import { runUnscoped } from "./tenantContext.js";

// Resolve an institute's platform-sharing flags (shareContent / shareAiKeys)
// from its Tenant record, with a short in-memory cache so authenticating a
// request doesn't hit the DB every time.
//
// Why this exists: auth binds a request to the LOGGED-IN user's own tenant, but
// resolveTenant already computed the sharing flags from the *host* tenant. When
// an institute admin uses the shared apex domain, the host resolves to the
// DEFAULT tenant (which always "shares"), so without refreshing the flags for
// the user's REAL tenant, an institute with sharing OFF would still see the
// platform's shared content. This loader lets auth set the correct flags.
//
// Defaults are OFF for a real institute; the default/platform tenant (and a
// missing tenant) always "shares" so the platform site and super-admin are
// never restricted.

const cache = new Map(); // tenantId -> { at, flags }
const TTL_MS = 60 * 1000;

export function clearTenantShareCache() {
  cache.clear();
}

export async function tenantShareFlags(tenantId) {
  if (!tenantId) return { shareContent: true, shareAiKeys: true };
  const key = String(tenantId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.flags;

  try {
    const t = await runUnscoped(() =>
      Tenant.findById(tenantId).select("isDefault shareContent shareAiKeys").lean()
    );
    const flags = !t || t.isDefault
      ? { shareContent: true, shareAiKeys: true }
      : { shareContent: t.shareContent === true, shareAiKeys: t.shareAiKeys === true };
    cache.set(key, { at: Date.now(), flags });
    return flags;
  } catch {
    // Never break authentication over a tenant lookup hiccup. Fail OPEN: this
    // flag only controls whether shared PLATFORM content is visible — the
    // separate tenantId scoping still prevents any cross-institute data access.
    return { shareContent: true, shareAiKeys: true };
  }
}
