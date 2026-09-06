import { describe, it, expect } from "vitest";
import { platformContentFilter } from "../../src/utils/platformScope.js";

// Only the non-DB branches are tested here. The admin-without-focus branch calls
// getDefaultTenantId() (a Mongoose read) and is covered by the integration suite.

describe("platformContentFilter", () => {
  it("returns no extra filter for non-admins (the tenant plugin scopes them)", async () => {
    expect(await platformContentFilter({ user: { role: "student" } })).toEqual({});
    expect(await platformContentFilter({ user: { role: "client" } })).toEqual({});
    expect(await platformContentFilter({})).toEqual({});
    expect(await platformContentFilter(undefined)).toEqual({});
  });

  it("returns no extra filter when an admin focuses one institute via X-Admin-Tenant", async () => {
    const req = {
      user: { role: "admin" },
      headers: { "x-admin-tenant": "0123456789abcdef01234567" }, // 24-hex id
    };
    expect(await platformContentFilter(req)).toEqual({});
  });
});
