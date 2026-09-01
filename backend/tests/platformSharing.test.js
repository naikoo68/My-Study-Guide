import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Security tests for the super-admin platform-sharing switches (default OFF).
// An institute must see the shared platform library / AI-key pool ONLY when its
// switch is ON. Runs the real tenantId plugin + tenantContext against an
// in-memory MongoDB. The per-request flags (shareContent / shareAiKeys) are set
// exactly the way resolveTenant sets them.

const INSTITUTE = "cccccccccccccccccccccccc";
const DEFAULT_TENANT = "dddddddddddddddddddddddd";

let mongoose;
let mongod;
let Stream;
let AiKey;
let runWithTenant;
let runUnscoped;

let n = 0;
const uniq = () => `${Date.now()}-${n++}`;

// Simulate an institute request with the given sharing flags.
const asInstitute = (flags, fn) =>
  runWithTenant({ tenantId: INSTITUTE, bypass: false, shareContent: !!flags.content, shareAiKeys: !!flags.ai }, async () => await fn());
// Simulate the default/platform site (always shares — like resolveTenant's isDefault branch).
const asDefaultSite = (fn) =>
  runWithTenant({ tenantId: DEFAULT_TENANT, bypass: false, shareContent: true, shareAiKeys: true }, async () => await fn());

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "platform_sharing_test" });

  await import("../src/config/registerModelPlugins.js");
  Stream = (await import("../src/models/Stream.js")).default;
  AiKey = (await import("../src/models/AiKey.js")).default;
  ({ runWithTenant, runUnscoped } = await import("../src/utils/tenantContext.js"));

  // Platform (super-admin, unscoped) content + AI key → tenantId null (shared).
  global.__platformStream = await runUnscoped(() => Stream.create({ name: `Platform ${uniq()}`, slug: `platform-${uniq()}` }));
  global.__platformKey = await runUnscoped(() => AiKey.create({ key: `platform-key-${uniq()}`, owner: null }));

  // The institute's OWN content + AI key → tenantId = INSTITUTE.
  global.__ownStream = await asInstitute({ content: false, ai: false }, () => Stream.create({ name: `Own ${uniq()}`, slug: `own-${uniq()}` }));
  global.__ownKey = await asInstitute({ content: false, ai: false }, () => AiKey.create({ key: `own-key-${uniq()}`, owner: null }));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("platform content sharing switch (default OFF)", () => {
  it("OFF: institute does NOT see platform content, only its own", async () => {
    const ids = (await asInstitute({ content: false, ai: false }, () => Stream.find({}).lean())).map((s) => String(s._id));
    expect(ids).toContain(String(global.__ownStream._id));
    expect(ids).not.toContain(String(global.__platformStream._id));
  });

  it("OFF: institute cannot read a platform stream by id", async () => {
    const found = await asInstitute({ content: false, ai: false }, () => Stream.findById(global.__platformStream._id).lean());
    expect(found).toBeNull();
  });

  it("ON: institute DOES see platform content plus its own", async () => {
    const ids = (await asInstitute({ content: true, ai: false }, () => Stream.find({}).lean())).map((s) => String(s._id));
    expect(ids).toContain(String(global.__ownStream._id));
    expect(ids).toContain(String(global.__platformStream._id));
  });

  it("the platform/default site always sees platform content", async () => {
    const found = await asDefaultSite(() => Stream.findById(global.__platformStream._id).lean());
    expect(found).not.toBeNull();
  });
});

describe("platform AI-key sharing switch (default OFF)", () => {
  it("OFF: institute does NOT see the platform AI keys, only its own", async () => {
    const keys = await asInstitute({ content: false, ai: false }, () => AiKey.find({ owner: null }).lean());
    const ids = keys.map((k) => String(k._id));
    expect(ids).toContain(String(global.__ownKey._id));
    expect(ids).not.toContain(String(global.__platformKey._id));
  });

  it("ON: institute DOES see the platform AI keys too", async () => {
    const keys = await asInstitute({ content: false, ai: true }, () => AiKey.find({ owner: null }).lean());
    const ids = keys.map((k) => String(k._id));
    expect(ids).toContain(String(global.__platformKey._id));
  });

  it("content and AI-key switches are independent", async () => {
    // content ON but AI OFF → sees platform content, not platform keys.
    const streams = (await asInstitute({ content: true, ai: false }, () => Stream.find({}).lean())).map((s) => String(s._id));
    const keys = (await asInstitute({ content: true, ai: false }, () => AiKey.find({ owner: null }).lean())).map((k) => String(k._id));
    expect(streams).toContain(String(global.__platformStream._id));
    expect(keys).not.toContain(String(global.__platformKey._id));
  });
});
