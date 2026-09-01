import { AsyncLocalStorage } from "node:async_hooks";

// Per-request tenant context. resolveTenant() runs the rest of each request
// inside this store, so any code (controllers, models, deep async) can read the
// current tenant WITHOUT it being passed around — and the model plugin can
// auto-scope every query. This is what makes Model-1 isolation safe by design:
// scoping lives in ONE place and can't be forgotten in a controller.
export const tenantStore = new AsyncLocalStorage();

// The current tenant id, or null when there's no request context (e.g. a
// background job / startup script) — in which case scoping is skipped.
export function getCurrentTenantId() {
  const s = tenantStore.getStore();
  return s ? s.tenantId : null;
}

// Override the current context's tenant. Used by auth to bind an authenticated
// request to the LOGGED-IN USER's own tenant (a trusted source), so a spoofed
// X-Tenant-Host header can't scope a session to another institute's data.
export function setCurrentTenantId(tenantId) {
  const s = tenantStore.getStore();
  if (s) {
    s.tenantId = tenantId;
    s.bypass = false; // targeting a tenant re-enables scoping to it
  }
}

// Platform-sharing flags for the current request. resolveTenant computes these
// from the resolved institute (the default/platform tenant is always "true";
// other institutes default to their own shareContent/shareAiKeys, which default
// OFF). Read by the tenantId plugin to decide whether an institute's reads may
// ALSO see shared/platform (null-tenant) content, and by the AI key resolver.
//
// Default TRUE when unset — so unscoped work (super-admin, background jobs) and
// any context that didn't set them behave exactly as before (see shared data).
export function getShareContent() {
  const s = tenantStore.getStore();
  return s && s.shareContent !== undefined ? s.shareContent : true;
}
export function getShareAiKeys() {
  const s = tenantStore.getStore();
  return s && s.shareAiKeys !== undefined ? s.shareAiKeys : true;
}

// Mark the current request as cross-tenant (unscoped) — used for a super-admin
// who legitimately operates across all institutes.
export function setUnscoped() {
  const s = tenantStore.getStore();
  if (s) s.bypass = true;
}

// Set the platform-sharing flags on the current context. Used by auth to refresh
// them for the LOGGED-IN user's own tenant (resolveTenant initially derives them
// from the host, which is wrong for an institute admin on the shared apex domain).
export function setShareFlags(shareContent, shareAiKeys) {
  const s = tenantStore.getStore();
  if (s) {
    s.shareContent = shareContent;
    s.shareAiKeys = shareAiKeys;
  }
}

// True when the current context has explicitly opted OUT of tenant scoping
// (super-admin cross-tenant work, auth lookups, internal maintenance).
export function isUnscoped() {
  const s = tenantStore.getStore();
  return !!(s && s.bypass);
}

// ---------------------------------------------------------------------------
// The platform / default tenant's id, cached in-process.
//
// The tenantId model plugin scopes queries inside a SYNCHRONOUS pre-hook, so it
// can't do an async Tenant lookup. We cache the default tenant's id here so that
// hook can widen a sharing-ON institute's reads to ALSO include the platform
// library that lives under the default tenant (content the one-time backfill
// migrated off `null` onto the default tenant). Populated at startup
// (ensureDefaultTenant) and whenever resolveTenant resolves the default tenant.
//
// Null until known → the plugin simply falls back to the pre-existing
// { own institute, null } behaviour, which is safe (it just doesn't surface the
// default-tenant library yet).
let _defaultTenantId = null;
export function setDefaultTenantId(id) {
  _defaultTenantId = id ? String(id) : null;
}
export function getDefaultTenantId() {
  return _defaultTenantId;
}

// Run `fn` within a given tenant context.
export function runWithTenant(ctx, fn) {
  return tenantStore.run(ctx || { tenantId: null, bypass: false }, fn);
}

// Run `fn` with tenant scoping DISABLED — for lookups that are intentionally
// global (e.g. resolving a user by JWT id, login by email, super-admin
// cross-tenant queries).
//
// IMPORTANT: we `await fn()` INSIDE the bypass context. Mongoose queries are
// lazy — `User.findOne(...)` only executes when awaited/`.then()`-ed. If we just
// returned the un-executed query, it would run AFTER this function returns —
// back under the request's normal (scoped) context — silently defeating the
// bypass. Awaiting here forces the query to execute (and its scoping hook to
// run) while the bypass context is active. This is the bug that stopped
// institute admins/students from being found by email.
export function runUnscoped(fn) {
  return tenantStore.run({ tenantId: null, bypass: true }, async () => await fn());
}
