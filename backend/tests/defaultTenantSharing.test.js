import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Approach-#1 tests: the platform library also lives UNDER THE DEFAULT TENANT
// (the one-time backfill migrated pre-existing content off `null` onto the
// default tenant). Turning an institute's "Share content" switch ON must now
// surface that default-tenant library too — NOT just the `null` slice — while
// the default institute's PRIVATE data (users/attempts) must NEVER leak, and an
// institute must never be able to EDIT the shared library.
//
// Runs the real tenantId plugin + tenantContext against an in-memory MongoDB.

const INSTITUTE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const DEFAULT_TENANT = "dddddddddddddddddddddddd";

let mongoose;
let mongod;
let Stream;
let AiKey;
let User;
let runWithTenant;
let runUnscoped;
let setDefaultTenantId;

let n = 0;
const uniq = () => `${Date.now()}-${n++}`;

// An institute request with the given sharing flags.
const asInstitute = (flags, fn) =>
  runWithTenant(
    { tenantId: INSTITUTE, bypass: false, shareContent: !!flags.content, shareAiKeys: !!flags.ai },
    async () => await fn()
  );
// The default/platform tenant's own context (always shares).
const asDefaultSite = (fn) =>
  runWithTenant(
    { tenantId: DEFAULT_TENANT, bypass: false, shareContent: true, shareAiKeys: true },
    async () => await fn()
  );

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "default_tenant_sharing_test" });

  await import("../src/config/registerModelPlugins.js");
  Stream = (await import("../src/models/Stream.js")).default;
  AiKey = (await import("../src/models/AiKey.js")).default;
  User = (await import("../src/models/User.js")).default;
  ({ runWithTenant, runUnscoped, setDefaultTenantId } = await import("../src/utils/tenantContext.js"));

  // Tell the scoping hook which tenant is the platform/default one.
  setDefaultTenantId(DEFAULT_TENANT);

  // Platform library stamped with the DEFAULT tenant id (as the backfill leaves it).
  global.__defStream = await asDefaultSite(() => Stream.create({ name: `Def ${uniq()}`, slug: `def-${uniq()}` }));
  global.__defKey = await asDefaultSite(() => AiKey.create({ key: `def-key-${uniq()}`, owner: null }));
  // A PRIVATE default-institute user — must NEVER be visible to another institute.
  global.__defUser = await asDefaultSite(() => User.create({ name: "Def Student", email: `def-${uniq()}@ex.com` }));

  // Legacy platform content still stored as null (super-admin unscoped).
  global.__nullStream = await runUnscoped(() => Stream.create({ name: `Null ${uniq()}`, slug: `null-${uniq()}` }));

  // The institute's OWN content + user.
  global.__ownStream = await asInstitute({ content: false, ai: false }, () => Stream.create({ name: `Own ${uniq()}`, slug: `own-${uniq()}` }));
  global.__ownUser = await asInstitute({ content: false, ai: false }, () => User.create({ name: "Own Student", email: `own-${uniq()}@ex.com` }));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("default-tenant platform library sharing (approach #1)", () => {
  it("ON: institute sees the DEFAULT-tenant library (plus null + its own)", async () => {
    const ids = (await asInstitute({ content: true, ai: false }, () => Stream.find({}).lean())).map((s) => String(s._id));
    expect(ids).toContain(String(global.__ownStream._id));
    expect(ids).toContain(String(global.__defStream._id)); // the migrated platform library
    expect(ids).toContain(String(global.__nullStream._id)); // legacy null-tenant content
  });

  it("ON: institute can read a default-tenant stream by id", async () => {
    const found = await asInstitute({ content: true, ai: false }, () => Stream.findById(global.__defStream._id).lean());
    expect(found).not.toBeNull();
  });

  it("OFF: institute sees only its own — NOT the default-tenant library, NOT null", async () => {
    const ids = (await asInstitute({ content: false, ai: false }, () => Stream.find({}).lean())).map((s) => String(s._id));
    expect(ids).toContain(String(global.__ownStream._id));
    expect(ids).not.toContain(String(global.__defStream._id));
    expect(ids).not.toContain(String(global.__nullStream._id));
  });

  it("OFF: institute cannot read a default-tenant stream by id", async () => {
    const found = await asInstitute({ content: false, ai: false }, () => Stream.findById(global.__defStream._id).lean());
    expect(found).toBeNull();
  });
});

describe("private default-institute data never leaks (isolation guarantee)", () => {
  it("even with content ON, an institute does NOT see the default tenant's users", async () => {
    const ids = (await asInstitute({ content: true, ai: true }, () => User.find({}).lean())).map((u) => String(u._id));
    expect(ids).toContain(String(global.__ownUser._id));
    expect(ids).not.toContain(String(global.__defUser._id));
  });

  it("even with content ON, an institute cannot read a default-tenant user by id", async () => {
    const found = await asInstitute({ content: true, ai: true }, () => User.findById(global.__defUser._id).lean());
    expect(found).toBeNull();
  });
});

describe("AI-key pool follows its own switch", () => {
  it("shareAiKeys ON: institute sees the default-tenant AI keys", async () => {
    const ids = (await asInstitute({ content: false, ai: true }, () => AiKey.find({ owner: null }).lean())).map((k) => String(k._id));
    expect(ids).toContain(String(global.__defKey._id));
  });

  it("shareAiKeys OFF: institute does NOT see the default-tenant AI keys", async () => {
    const ids = (await asInstitute({ content: true, ai: false }, () => AiKey.find({ owner: null }).lean())).map((k) => String(k._id));
    expect(ids).not.toContain(String(global.__defKey._id));
  });
});

describe("shared library stays read-only to institutes", () => {
  it("an institute cannot update a default-tenant stream (write is scoped to its own)", async () => {
    const res = await asInstitute({ content: true, ai: false }, () =>
      Stream.updateOne({ _id: global.__defStream._id }, { $set: { name: "HACKED" } })
    );
    expect(res.modifiedCount).toBe(0);
    // Confirm it's untouched.
    const still = await asDefaultSite(() => Stream.findById(global.__defStream._id).lean());
    expect(still.name).not.toBe("HACKED");
  });

  it("an institute cannot delete a default-tenant stream", async () => {
    const res = await asInstitute({ content: true, ai: false }, () => Stream.deleteOne({ _id: global.__defStream._id }));
    expect(res.deletedCount).toBe(0);
    const still = await asDefaultSite(() => Stream.findById(global.__defStream._id).lean());
    expect(still).not.toBeNull();
  });
});
