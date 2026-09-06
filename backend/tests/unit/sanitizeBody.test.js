import { describe, it, expect } from "vitest";
import { sanitizeBody, ALLOW } from "../../src/utils/sanitizeBody.js";

describe("sanitizeBody — denylist mode (default)", () => {
  it("strips server-only / protected fields", () => {
    const out = sanitizeBody({
      name: "Physics",
      tenantId: "other-tenant",
      owner: "someone",
      _id: "spoofed",
      deleted: true,
      publicToken: "forged",
    });
    expect(out).toEqual({ name: "Physics" });
  });

  it("keeps ordinary content fields untouched", () => {
    const body = { name: "Algebra", color: "#fff", order: 3, isActive: true };
    expect(sanitizeBody(body)).toEqual(body);
  });

  it("strips extra fields passed as an array", () => {
    const out = sanitizeBody({ name: "X", slug: "x", secret: "y" }, ["slug", "secret"]);
    expect(out).toEqual({ name: "X" });
  });

  it("returns an empty object for a nullish body", () => {
    expect(sanitizeBody(null)).toEqual({});
    expect(sanitizeBody(undefined)).toEqual({});
  });

  it("does not mutate the original body", () => {
    const body = { name: "X", _id: "keep-on-original" };
    sanitizeBody(body);
    expect(body._id).toBe("keep-on-original");
  });
});

describe("sanitizeBody — allowlist mode", () => {
  it("keeps ONLY the allowed fields", () => {
    const out = sanitizeBody(
      { name: "Bio", color: "#0f0", hacker: "nope", order: 1 },
      { allow: ["name", "color"] }
    );
    expect(out).toEqual({ name: "Bio", color: "#0f0" });
  });

  it("never keeps protected fields or slug even if allowed", () => {
    const out = sanitizeBody(
      { name: "Bio", slug: "bio", tenantId: "t", owner: "o", _id: "x" },
      { allow: ["name", "slug", "tenantId", "owner", "_id"] }
    );
    expect(out).toEqual({ name: "Bio" });
  });

  it("omits allowed fields that are absent from the body", () => {
    const out = sanitizeBody({ name: "Bio" }, { allow: ["name", "color", "icon"] });
    expect(out).toEqual({ name: "Bio" });
  });
});

describe("ALLOW model allowlists", () => {
  it("exposes per-model field lists that never include sensitive fields", () => {
    expect(Array.isArray(ALLOW.STREAM)).toBe(true);
    for (const [model, fields] of Object.entries(ALLOW)) {
      expect(fields.length, model).toBeGreaterThan(0);
      for (const f of ["_id", "tenantId", "owner", "slug", "publicToken"]) {
        expect(fields, `${model} must not allow ${f}`).not.toContain(f);
      }
    }
  });
});
