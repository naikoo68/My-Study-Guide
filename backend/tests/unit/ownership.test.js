import { describe, it, expect } from "vitest";
import { isClient, ownerValue, ownerFilter } from "../../src/utils/ownership.js";

const clientReq = { user: { role: "client", _id: "client-1" } };
const adminReq = { user: { role: "admin", _id: "admin-1" } };

describe("isClient", () => {
  it("is true only for the client role", () => {
    expect(isClient(clientReq)).toBe(true);
    expect(isClient(adminReq)).toBe(false);
    expect(isClient({})).toBe(false);
    expect(isClient({ user: {} })).toBe(false);
  });
});

describe("ownerValue", () => {
  it("stamps a client's own id, but null for admins/platform content", () => {
    expect(ownerValue(clientReq)).toBe("client-1");
    expect(ownerValue(adminReq)).toBeNull();
  });
});

describe("ownerFilter", () => {
  it("scopes a client to its own content", () => {
    expect(ownerFilter(clientReq)).toEqual({ owner: "client-1" });
  });

  it("scopes admins to owner:null (platform + legacy content)", () => {
    expect(ownerFilter(adminReq)).toEqual({ owner: null });
  });
});
