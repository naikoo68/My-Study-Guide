import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Guards the fix for: an institute admin on the shared apex domain saw the
// platform's shared content even with sharing OFF, because auth bound their
// tenant id but not the sharing flags. tenantShareFlags() resolves the correct
// flags for a tenant so auth can set them.

let mongoose;
let mongod;
let Tenant;
let tenantShareFlags;
let clearTenantShareCache;

let n = 0;
const uniq = () => `${Date.now()}-${n++}`;

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "tenant_share_flags_test" });
  await import("../src/config/registerModelPlugins.js");
  Tenant = (await import("../src/models/Tenant.js")).default;
  ({ tenantShareFlags, clearTenantShareCache } = await import("../src/utils/tenantShare.js"));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const mkTenant = (extra) => Tenant.create({ name: `T ${uniq()}`, slug: `t-${uniq()}`, ...extra });

describe("tenantShareFlags", () => {
  it("no tenant id → shares everything (safe default for jobs/public)", async () => {
    expect(await tenantShareFlags(null)).toEqual({ shareContent: true, shareAiKeys: true });
  });

  it("default/platform tenant always shares", async () => {
    const t = await mkTenant({ isDefault: true });
    expect(await tenantShareFlags(t._id)).toEqual({ shareContent: true, shareAiKeys: true });
  });

  it("a normal institute defaults to OFF for both", async () => {
    const t = await mkTenant({});
    expect(await tenantShareFlags(t._id)).toEqual({ shareContent: false, shareAiKeys: false });
  });

  it("respects per-institute switches independently", async () => {
    const contentOnly = await mkTenant({ shareContent: true });
    const aiOnly = await mkTenant({ shareAiKeys: true });
    expect(await tenantShareFlags(contentOnly._id)).toEqual({ shareContent: true, shareAiKeys: false });
    expect(await tenantShareFlags(aiOnly._id)).toEqual({ shareContent: false, shareAiKeys: true });
  });

  it("reflects a change after the cache is cleared", async () => {
    const t = await mkTenant({});
    expect((await tenantShareFlags(t._id)).shareContent).toBe(false);
    await Tenant.updateOne({ _id: t._id }, { $set: { shareContent: true } });
    clearTenantShareCache();
    expect((await tenantShareFlags(t._id)).shareContent).toBe(true);
  });
});
