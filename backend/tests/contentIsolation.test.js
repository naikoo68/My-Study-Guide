import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Extends the tenant-isolation security tests beyond Questions to the rest of
// the content hierarchy: Streams, Subjects, Topics and Quizzes. Same real code
// path (global tenantId plugin + tenantContext) against an in-memory MongoDB.
// Proves no content level leaks between institutes (tenants).

const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

let mongoose;
let mongod;
let models;
let runWithTenant;
let runUnscoped;

let n = 0;
const uniq = () => `${Date.now()}-${n++}`;
const oid = () => new mongoose.Types.ObjectId();

const asTenant = (tid, fn) => runWithTenant({ tenantId: tid, bypass: false }, async () => await fn());
const asA = (fn) => asTenant(TENANT_A, fn);
const asB = (fn) => asTenant(TENANT_B, fn);

// Minimal VALID doc per level (satisfies required fields). `disabled` exists on
// all four, so it's a safe field to attempt an illegal cross-tenant edit with.
const factories = {
  Stream: () => ({ name: `Stream ${uniq()}`, slug: `stream-${uniq()}` }),
  Subject: () => ({ name: `Subject ${uniq()}`, slug: `subject-${uniq()}` }),
  Topic: () => ({ title: `Topic ${uniq()}`, subject: oid() }),
  Quiz: () => ({ title: `Quiz ${uniq()}`, subject: oid(), session: oid() }),
};

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "content_isolation_test" });

  await import("../src/config/registerModelPlugins.js");
  models = {
    Stream: (await import("../src/models/Stream.js")).default,
    Subject: (await import("../src/models/Subject.js")).default,
    Topic: (await import("../src/models/Topic.js")).default,
    Quiz: (await import("../src/models/Quiz.js")).default,
  };
  ({ runWithTenant, runUnscoped } = await import("../src/utils/tenantContext.js"));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// Run the same isolation checks against one content level.
for (const level of ["Stream", "Subject", "Topic", "Quiz"]) {
  describe(`tenant isolation — ${level}`, () => {
    let a;
    let b;
    let shared;

    beforeAll(async () => {
      const M = models[level];
      a = await asA(() => M.create(factories[level]()));
      b = await asB(() => M.create(factories[level]()));
      shared = await runUnscoped(() => M.create(factories[level]()));
    });

    it("stamps each tenant's record with its own tenantId (shared stays null)", () => {
      expect(String(a.tenantId)).toBe(TENANT_A);
      expect(String(b.tenantId)).toBe(TENANT_B);
      expect(shared.tenantId ?? null).toBeNull();
    });

    it("READ: Tenant A cannot read Tenant B's record by id", async () => {
      expect(await asA(() => models[level].findById(b._id).lean())).toBeNull();
    });

    it("READ (list): Tenant A sees its own + shared, never Tenant B", async () => {
      const ids = (await asA(() => models[level].find({}).lean())).map((x) => String(x._id));
      expect(ids).toContain(String(a._id));
      expect(ids).toContain(String(shared._id));
      expect(ids).not.toContain(String(b._id));
    });

    it("EDIT: Tenant A cannot update Tenant B's record", async () => {
      const res = await asA(() => models[level].findOneAndUpdate({ _id: b._id }, { $set: { disabled: true } }, { new: true }));
      expect(res).toBeNull();
    });

    it("EDIT (bulk): updateMany from Tenant A cannot modify Tenant B", async () => {
      const r = await asA(() => models[level].updateMany({ _id: { $in: [b._id] } }, { $set: { disabled: true } }));
      expect(r.modifiedCount ?? 0).toBe(0);
    });

    it("DELETE: Tenant A cannot delete Tenant B's record", async () => {
      const r = await asA(() => models[level].deleteOne({ _id: b._id }));
      expect(r.deletedCount ?? 0).toBe(0);
      const still = await runUnscoped(() => models[level].findById(b._id).lean());
      expect(still).not.toBeNull();
    });

    it("positive control: Tenant B CAN read its own record", async () => {
      expect(await asB(() => models[level].findById(b._id).lean())).not.toBeNull();
    });
  });
}
