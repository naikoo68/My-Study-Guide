import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Cross-posting users: each is another person's own social accounts. Their
// settings start empty, saving as them never touches the main account, their
// schedules are separate, and a bad profile id never falls back to the main
// account's settings. Real controllers + tenant plugin, in-memory MongoDB.

let mongoose, mongod, Settings, FbSchedule;
let updateSettings, getSettings, createProfile, deleteProfile, createSchedule, listSchedules, getFacebookConfig;
let runWithTenant, runAsSocialProfile;

const mkRes = () => ({
  code: 200, body: undefined,
  set() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; },
});
const asAdmin = (fn, profileId = "") =>
  runWithTenant({ tenantId: null, bypass: false, shareContent: false, shareAiKeys: false }, () => runAsSocialProfile(profileId, fn));

beforeAll(async () => {
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "cross_posting_test" });
  await import("../src/config/registerModelPlugins.js");
  Settings = (await import("../src/models/Settings.js")).default;
  FbSchedule = (await import("../src/models/FbSchedule.js")).default;
  ({ updateSettings, getSettings } = await import("../src/controllers/settingsController.js"));
  ({ createProfile, deleteProfile } = await import("../src/controllers/socialProfileController.js"));
  ({ createSchedule, listSchedules } = await import("../src/controllers/facebookController.js"));
  ({ getFacebookConfig } = await import("../src/config/facebook.js"));
  ({ runWithTenant } = await import("../src/utils/tenantContext.js"));
  ({ runAsSocialProfile } = await import("../src/utils/socialProfile.js"));
  await asAdmin(() => Settings.create({ key: "site", siteName: "Main", fbPageId: "MAIN_PAGE", fbPageAccessToken: "MAIN_TOKEN", fbAutoComments: ["main comment"] }));
});

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("cross-posting users", () => {
  let pid;
  it("a new user starts empty and saves only to their own settings", async () => {
    const res = mkRes();
    await asAdmin(() => createProfile({ body: { name: "Rahul" } }, res));
    expect(res.code).toBe(201);
    pid = res.body.profile.id;

    await asAdmin(async () => {
      const cfg = await getFacebookConfig();
      expect(cfg.pageId).toBe("");
      expect(cfg.token).toBe("");
      const r = mkRes();
      await getSettings({ user: { role: "admin" } }, r);
      expect(r.body.fbAutoComments).toEqual([]);
      const u = mkRes();
      await updateSettings({ body: { fbPageId: "RAHUL_PAGE", fbPageAccessToken: "RAHUL_TOKEN" } }, u);
      expect(u.code).toBe(200);
      expect((await getFacebookConfig()).pageId).toBe("RAHUL_PAGE");
    }, pid);

    await asAdmin(async () => {
      const main = await getFacebookConfig();
      expect(main.pageId).toBe("MAIN_PAGE");
      expect(main.token).toBe("MAIN_TOKEN");
    });
  });

  it("keeps each account's schedules separate", async () => {
    const body = { kind: "question", source: { quiz: "a".repeat(24), label: "Q" }, times: ["09:00"], mode: "recurring" };
    await asAdmin(() => createSchedule({ body: { ...body, title: "rahul-sch" }, user: {} }, mkRes()), pid);
    await asAdmin(() => createSchedule({ body: { ...body, title: "main-sch" }, user: {} }, mkRes()));
    const mine = mkRes();
    await asAdmin(() => listSchedules({ query: {} }, mine), pid);
    expect(mine.body.items.map((s) => s.title)).toEqual(["rahul-sch"]);
    const main = mkRes();
    await asAdmin(() => listSchedules({ query: {} }, main));
    expect(main.body.items.map((s) => s.title)).toEqual(["main-sch"]);
  });

  it("an unknown user id never falls back to the main account", async () => {
    await asAdmin(async () => {
      await expect(getFacebookConfig()).rejects.toThrow(/not found/i);
      await expect(updateSettings({ body: { fbPageId: "HACK" } }, mkRes())).rejects.toThrow(/not found/i);
    }, "f".repeat(24));
    await asAdmin(async () => expect((await getFacebookConfig()).pageId).toBe("MAIN_PAGE"));
  });

  it("deleting a user removes their settings and schedules only", async () => {
    await asAdmin(() => deleteProfile({ params: { id: pid } }, mkRes()));
    await asAdmin(async () => {
      expect(await Settings.countDocuments({ socialProfile: true })).toBe(0);
      expect((await FbSchedule.find({}).lean()).map((s) => s.title)).toEqual(["main-sch"]);
      expect((await getFacebookConfig()).pageId).toBe("MAIN_PAGE");
    });
  });
});
