import Tenant from "../models/Tenant.js";
import { runUnscoped } from "./tenantContext.js";

// The platform (default) tenant id, resolved once and cached. Used to scope the
// SUPER-ADMIN's content lists to the platform's own content.
let _defaultId; // undefined = not resolved yet, null = none found, else ObjectId

export async function getDefaultTenantId() {
  if (_defaultId !== undefined) return _defaultId;
  try {
    const t = await runUnscoped(() => Tenant.findOne({ isDefault: true }).select("_id").lean());
    _defaultId = t?._id || null;
  } catch {
    _defaultId = null;
  }
  return _defaultId;
}

// A Mongo filter fragment that restricts a TOP-LEVEL content query to the
// PLATFORM's own content when the caller is the platform super-admin.
//
// Why: a super-admin browses content UNSCOPED (sees every tenant's rows). Since
// "Share to institutes" copies content into institute tenants (owner:null,
// tenantId=<instituteId>), those copies would otherwise show up in the
// super-admin's own /admin content lists. Restricting to the default tenant
// (plus legacy null-tenant) hides institutes' copies while still showing all
// the platform's own content — which is a mix of null and default-id rows.
//
// Returns {} (no extra filter) for:
//   - non-admins (the tenantId plugin already scopes them to their institute), and
//   - an admin focusing ONE institute via the X-Admin-Tenant header (the plugin
//     scopes that request), and
//   - when the default tenant can't be resolved (fail open — don't hide content).
export async function platformContentFilter(req) {
  if (req?.user?.role !== "admin") return {};
  const focus = String(req?.headers?.["x-admin-tenant"] || "").trim();
  if (/^[a-f0-9]{24}$/i.test(focus)) return {};
  const defaultId = await getDefaultTenantId();
  if (!defaultId) return {};
  return { tenantId: { $in: [defaultId, null] } };
}
