import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Regression test for the bug where an institute admin's settings save (e.g.
// completing the setup wizard → onboardingCompleted) did NOT persist, so the
// wizard kept reappearing.
//
// Cause: updateSettings captured getOrCreate() (which could return the DEFAULT
// tenant's doc for an institute with no doc yet) then findByIdAndUpdate(_id,…);
// the tenantId plugin forces tenantId=current on writes, so the _id matched but
// the tenant didn't → 0 rows updated, silently lost. The fix resolves the
// CURRENT tenant's OWN doc and save()s it.
//
// This drives the REAL updateSettings/getSettings controllers with the real
// tenant plugin against an in-memory MongoDB.

const INSTITUTE = "eeeeeeeeeeeeeeeeeeeeeeee";

let mongoose;
let mongod;
let Tenant;
let Settings;
let getSettings;
let updateSettings;
let runWithTenant;
let runUnscoped;

// Minimal req/res doubles.
const mkRes = () => ({
  code: 200,
  body: undefined,
  set() { return this; },
  status(c) { this.code = c; return this; },
  json(b) { this.body = b; return this; },
});
const asTenant = (tid, fn) => runWithTenant({ tenantId: tid, bypass: false, shareContent: false, shareAiKeys: false }, async () => await fn());

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "settings_persist_test" });

  await import("../src/config/registerModelPlugins.js");
  Tenant = (await import("../src/models/Tenant.js")).default;
  Settings = (await import("../src/models/Settings.js")).default;
  ({ getSettings, updateSettings } = await import("../src/controllers/settingsController.js"));
  ({ runWithTenant, runUnscoped } = await import("../src/utils/tenantContext.js"));

  // A default/platform tenant WITH its own settings doc (this is the doc the
  // buggy fallback used to grab for institutes).
  const def = await runUnscoped(() => Tenant.create({ name: "Platform", slug: "platform", isDefault: true }));
  await runUnscoped(() => Settings.create({ key: "site", tenantId: def._id, siteName: "Platform Site" }));

  // A real institute (no settings doc yet).
  await runUnscoped(() => Tenant.create({ _id: new mongoose.Types.ObjectId(INSTITUTE), name: "My ABC Academy", slug: "myabcacademy" }));
});

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("settings save persists for an institute (wizard completion sticks)", () => {
  it("saving onboardingCompleted for an institute is readable back by that institute", async () => {
    // Institute admin completes the wizard.
    await asTenant(INSTITUTE, async () => {
      const res = mkRes();
      await updateSettings({ body: { onboardingCompleted: true, siteName: "My ABC Academy" } }, res);
      expect(res.code).toBe(200);
      expect(res.body.onboardingCompleted).toBe(true);
    });

    // Re-read as the institute → the flag stuck.
    await asTenant(INSTITUTE, async () => {
      const res = mkRes();
      await getSettings({ body: {} }, res);
      expect(res.body.onboardingCompleted).toBe(true);
      expect(res.body.siteName).toBe("My ABC Academy");
    });
  });

  it("did NOT modify the default/platform tenant's settings", async () => {
    const platform = await runUnscoped(() => Settings.findOne({ key: "site" }).where({ siteName: "Platform Site" }).lean());
    expect(platform).not.toBeNull();
    expect(platform.onboardingCompleted !== true).toBe(true); // platform untouched
  });

  it("stored the institute's settings under ITS OWN tenantId", async () => {
    const mine = await runUnscoped(() => Settings.findOne({ key: "site", tenantId: INSTITUTE }).lean());
    expect(mine).not.toBeNull();
    expect(mine.onboardingCompleted).toBe(true);
  });
});
