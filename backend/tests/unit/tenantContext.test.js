import { describe, it, expect } from "vitest";
import {
  getCurrentTenantId,
  setCurrentTenantId,
  getShareContent,
  getShareAiKeys,
  setShareFlags,
  setUnscoped,
  isUnscoped,
  runWithTenant,
  runUnscoped,
} from "../../src/utils/tenantContext.js";

describe("outside any request context (no store)", () => {
  it("reads safe defaults and mutators are no-ops", () => {
    expect(getCurrentTenantId()).toBeNull();
    expect(isUnscoped()).toBe(false);
    // sharing flags default TRUE when unset (unscoped/background work sees shared data)
    expect(getShareContent()).toBe(true);
    expect(getShareAiKeys()).toBe(true);
    // mutators must not throw when there is no active store
    expect(() => setCurrentTenantId("t1")).not.toThrow();
    expect(() => setUnscoped()).not.toThrow();
    expect(() => setShareFlags(false, false)).not.toThrow();
    // ...and they had no effect
    expect(getCurrentTenantId()).toBeNull();
  });
});

describe("runWithTenant", () => {
  it("exposes the tenant id to code running inside it", () => {
    const seen = runWithTenant({ tenantId: "inst-1", bypass: false }, () => getCurrentTenantId());
    expect(seen).toBe("inst-1");
    // context does not leak outside the run
    expect(getCurrentTenantId()).toBeNull();
  });

  it("defaults to a null-tenant, non-bypass context when ctx is omitted", () => {
    runWithTenant(null, () => {
      expect(getCurrentTenantId()).toBeNull();
      expect(isUnscoped()).toBe(false);
    });
  });

  it("setCurrentTenantId overrides the tenant and re-enables scoping", () => {
    runWithTenant({ tenantId: "a", bypass: true }, () => {
      setCurrentTenantId("b");
      expect(getCurrentTenantId()).toBe("b");
      expect(isUnscoped()).toBe(false); // targeting a tenant clears bypass
    });
  });

  it("setShareFlags updates the per-context sharing flags", () => {
    runWithTenant({ tenantId: "a" }, () => {
      expect(getShareContent()).toBe(true); // default when unset
      setShareFlags(false, true);
      expect(getShareContent()).toBe(false);
      expect(getShareAiKeys()).toBe(true);
    });
  });

  it("setUnscoped marks the context cross-tenant", () => {
    runWithTenant({ tenantId: "a", bypass: false }, () => {
      expect(isUnscoped()).toBe(false);
      setUnscoped();
      expect(isUnscoped()).toBe(true);
    });
  });
});

describe("runUnscoped", () => {
  it("runs fn with scoping disabled and awaits the result", async () => {
    const result = await runUnscoped(async () => {
      expect(getCurrentTenantId()).toBeNull();
      expect(isUnscoped()).toBe(true);
      return "done";
    });
    expect(result).toBe("done");
    // scoping state does not leak out
    expect(isUnscoped()).toBe(false);
  });

  it("isolates nested contexts (unscoped inside a tenant run)", async () => {
    await runWithTenant({ tenantId: "inst-9", bypass: false }, async () => {
      expect(getCurrentTenantId()).toBe("inst-9");
      const inner = await runUnscoped(async () => getCurrentTenantId());
      expect(inner).toBeNull();
      // back in the outer tenant context afterwards
      expect(getCurrentTenantId()).toBe("inst-9");
    });
  });
});
