import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// getLogo must resolve the logo the SAME way getSettings/findSite does.
//
// Regression: a base64 logo stored on a NULL-tenant settings doc (the normal
// case when tenant enforcement is OFF, and for legacy data) rendered as a
// permanently BROKEN image, because getLogo looked up only the default tenant's
// doc and had no null-tenant / any fallback — so it 404'd while getSettings
// happily served the proxy URL that points here.
// ─────────────────────────────────────────────────────────────────────────

// A 1x1 transparent PNG.
const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let mongoose, mongod, Settings, Tenant, getLogo, runUnscoped;

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    redirectedTo: null,
    status(c) { this.statusCode = c; return this; },
    set(k, v) { if (k && typeof k === "object") Object.assign(this.headers, k); else this.headers[k] = v; return this; },
    end(b) { this.ended = true; if (b !== undefined) this.body = b; return this; },
    redirect(code, url) { this.statusCode = code; this.redirectedTo = url; return this; },
  };
}

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "off"; // captured at plugin import; keep off here
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "logo_test" });
  await import("../src/config/registerModelPlugins.js");
  Settings = (await import("../src/models/Settings.js")).default;
  Tenant = (await import("../src/models/Tenant.js")).default;
  ({ getLogo } = await import("../src/controllers/settingsController.js"));
  ({ runUnscoped } = await import("../src/utils/tenantContext.js"));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await runUnscoped(() => Settings.deleteMany({}));
  await runUnscoped(() => Tenant.deleteMany({}));
});

describe("getLogo — resolution fallback", () => {
  it("serves a base64 logo on a NULL-tenant doc even when a default tenant exists (the bug)", async () => {
    await runUnscoped(() => Tenant.create({ name: "Platform", slug: "platform", isDefault: true }));
    await runUnscoped(() => Settings.create({ key: "site", tenantId: null, logoUrl: PNG_DATA_URI }));

    const res = mockRes();
    await getLogo({ query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/png");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("redirects to an externally-hosted (Cloudinary) logo URL", async () => {
    await runUnscoped(() => Settings.create({ key: "site", tenantId: null, logoUrl: "https://res.cloudinary.com/demo/logo.png" }));
    const res = mockRes();
    await getLogo({ query: {} }, res);
    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe("https://res.cloudinary.com/demo/logo.png");
  });

  it("404s a logo accidentally stored as this endpoint's own proxy URL (no redirect loop)", async () => {
    await runUnscoped(() => Settings.create({ key: "site", tenantId: null, logoUrl: "https://x/api/settings/logo?v=1" }));
    const res = mockRes();
    await getLogo({ query: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(res.redirectedTo).toBeNull();
  });

  it("404s cleanly when no logo is set anywhere", async () => {
    await runUnscoped(() => Settings.create({ key: "site", tenantId: null, logoUrl: "" }));
    const res = mockRes();
    await getLogo({ query: {} }, res);
    expect(res.statusCode).toBe(404);
  });
});
