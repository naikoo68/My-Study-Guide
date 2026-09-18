import { describe, it, expect } from "vitest";
import { publicLogoUrl, apiOriginFromRequest } from "../../src/utils/logoUrl.js";

const ORIGIN = "https://api.mystudyguide.in";

describe("publicLogoUrl", () => {
  it("rewrites a base64 data-URI logo to the cacheable endpoint URL", () => {
    const out = publicLogoUrl("data:image/png;base64,AAAA", { origin: ORIGIN, version: 123 });
    expect(out).toBe(`${ORIGIN}/api/settings/logo?v=123`);
  });

  it("includes the tenant id when provided", () => {
    const out = publicLogoUrl("data:image/png;base64,AAAA", { origin: ORIGIN, version: 5, tenantId: "abc" });
    expect(out).toBe(`${ORIGIN}/api/settings/logo?v=5&t=abc`);
  });

  it("leaves an already-hosted http(s) URL untouched", () => {
    const url = "https://cdn.example.com/logo.png";
    expect(publicLogoUrl(url, { origin: ORIGIN, version: 1 })).toBe(url);
  });

  it("returns empty string for an empty/nullish logo", () => {
    expect(publicLogoUrl("", { origin: ORIGIN })).toBe("");
    expect(publicLogoUrl(null, { origin: ORIGIN })).toBe("");
    expect(publicLogoUrl(undefined, { origin: ORIGIN })).toBe("");
  });

  it("strips a trailing slash from the origin", () => {
    const out = publicLogoUrl("data:image/png;base64,AAAA", { origin: ORIGIN + "/", version: 1 });
    expect(out).toBe(`${ORIGIN}/api/settings/logo?v=1`);
  });
});

describe("apiOriginFromRequest", () => {
  it("prefers x-forwarded-proto / x-forwarded-host (behind a proxy)", () => {
    const req = { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "api.mystudyguide.in" }, get: () => "internal:5000" };
    expect(apiOriginFromRequest(req)).toBe("https://api.mystudyguide.in");
  });

  it("falls back to req.protocol + Host header", () => {
    const req = { headers: {}, protocol: "https", get: (h) => (h === "host" ? "api.mystudyguide.in" : "") };
    expect(apiOriginFromRequest(req)).toBe("https://api.mystudyguide.in");
  });

  it("takes only the first proto when x-forwarded-proto is a list", () => {
    const req = { headers: { "x-forwarded-proto": "https, http" }, get: () => "api.mystudyguide.in" };
    expect(apiOriginFromRequest(req)).toBe("https://api.mystudyguide.in");
  });
});
