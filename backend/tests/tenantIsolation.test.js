import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// MANDATORY SECURITY TESTS — multi-tenant isolation.
//
// These prove that one institute (tenant) can NEVER read, edit, delete or move
// another institute's questions. They run the REAL code path: the global
// `tenantId` Mongoose plugin + the real `tenantContext` (AsyncLocalStorage),
// against an in-memory MongoDB — the same Mongoose engine production uses
// (DB_ENGINE=oracle/mongo). No mocking of the isolation logic.
//
// Why this matters: cross-tenant isolation is enforced automatically by the
// plugin ONLY when TENANT_ENFORCEMENT=on. We force it on here so a regression
// (or someone turning it off) makes these tests fail loudly.
// ─────────────────────────────────────────────────────────────────────────

// 24-hex tenant ids so Mongoose can cast them to ObjectId.
const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

let mongoose;
let mongod;
let Question;
let runWithTenant;
let runUnscoped;

// A question for Tenant A, one for Tenant B, and one shared/platform question
// (created by the super-admin with no tenant → tenantId null).
let qA;
let qB;
let shared;
let quizAId; // a destination quiz id owned by Tenant A (for the "move" test)

// Run `fn` as an authenticated request for `tid`. Critically we AWAIT inside the
// tenant context: Mongoose queries are lazy, so awaiting inside guarantees the
// plugin's scoping hook reads the right tenant at execution time (same reason
// runUnscoped awaits internally).
const asTenant = (tid, fn) => runWithTenant({ tenantId: tid, bypass: false }, async () => await fn());
const asA = (fn) => asTenant(TENANT_A, fn);
const asB = (fn) => asTenant(TENANT_B, fn);

const mkQ = (text) => ({ text, type: "mcq", options: ["a", "b", "c", "d"], correct: 0 });

beforeAll(async () => {
  // Turn tenant enforcement ON *before* importing the plugin/models — the plugin
  // reads this flag once at module load.
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();

  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "isolation_test" });

  // Register the global plugins (tenantId + soft-delete) BEFORE any model schema
  // compiles, exactly like the app's entry points do.
  await import("../src/config/registerModelPlugins.js");
  Question = (await import("../src/models/Question.js")).default;
  ({ runWithTenant, runUnscoped } = await import("../src/utils/tenantContext.js"));

  quizAId = new mongoose.Types.ObjectId();

  // Seed: each tenant creates its own question; the super-admin creates a shared
  // (null-tenant) platform question.
  qA = await asA(() => Question.create(mkQ("A-owned question")));
  qB = await asB(() => Question.create(mkQ("B-owned question")));
  shared = await runUnscoped(() => Question.create(mkQ("Shared platform question")));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("multi-tenant isolation", () => {
  it("stamps each tenant's content with its own tenantId (and shared stays null)", () => {
    expect(String(qA.tenantId)).toBe(TENANT_A);
    expect(String(qB.tenantId)).toBe(TENANT_B);
    expect(qB.tenantId).not.toBeNull();
    expect(shared.tenantId ?? null).toBeNull();
  });

  it("READ: Tenant A cannot read Tenant B's question by id", async () => {
    const found = await asA(() => Question.findById(qB._id).lean());
    expect(found).toBeNull();
  });

  it("READ (list): Tenant A sees its own + shared, never Tenant B", async () => {
    const list = await asA(() => Question.find({}).lean());
    const ids = list.map((q) => String(q._id));
    expect(ids).toContain(String(qA._id));
    expect(ids).toContain(String(shared._id)); // platform content is shared
    expect(ids).not.toContain(String(qB._id)); // never another tenant's
  });

  it("EDIT: Tenant A cannot update Tenant B's question", async () => {
    const res = await asA(() =>
      Question.findOneAndUpdate({ _id: qB._id }, { $set: { text: "HACKED BY A" } }, { new: true })
    );
    expect(res).toBeNull();
    const fresh = await runUnscoped(() => Question.findById(qB._id).lean());
    expect(fresh.text).toBe("B-owned question"); // untouched
  });

  it("EDIT (bulk): updateMany from Tenant A cannot modify Tenant B's questions", async () => {
    const r = await asA(() => Question.updateMany({ _id: { $in: [qB._id] } }, { $set: { text: "HACKED" } }));
    expect(r.modifiedCount ?? 0).toBe(0);
    const fresh = await runUnscoped(() => Question.findById(qB._id).lean());
    expect(fresh.text).toBe("B-owned question");
  });

  it("DELETE: Tenant A cannot delete Tenant B's question", async () => {
    const r = await asA(() => Question.deleteOne({ _id: qB._id }));
    expect(r.deletedCount ?? 0).toBe(0);
    const still = await runUnscoped(() => Question.findById(qB._id).lean());
    expect(still).not.toBeNull();
  });

  it("MOVE: Tenant A cannot repoint Tenant B's questions into its own quiz", async () => {
    // Mirrors contentController.moveQuestions' core write.
    const r = await asA(() =>
      Question.updateMany({ _id: { $in: [qB._id] } }, { $set: { quiz: quizAId } }, { timestamps: false })
    );
    expect(r.modifiedCount ?? 0).toBe(0);
    const fresh = await runUnscoped(() => Question.findById(qB._id).lean());
    expect(fresh.quiz ?? null).toBeNull(); // B's question was never moved
  });

  it("ACCESS (private): a Tenant A findOne filter can't reach Tenant B content", async () => {
    const byText = await asA(() => Question.findOne({ text: "B-owned question" }).lean());
    expect(byText).toBeNull();
  });

  // Positive controls — isolation must not over-block legitimate access.
  it("positive control: Tenant B CAN read and edit its OWN question", async () => {
    const own = await asB(() => Question.findById(qB._id).lean());
    expect(own).not.toBeNull();
    const upd = await asB(() =>
      Question.findOneAndUpdate({ _id: qB._id }, { $set: { text: "B legitimate edit" } }, { new: true })
    );
    expect(upd).not.toBeNull();
    expect(upd.text).toBe("B legitimate edit");
  });

  it("positive control: shared/platform content is visible to BOTH tenants", async () => {
    const a = await asA(() => Question.findById(shared._id).lean());
    const b = await asB(() => Question.findById(shared._id).lean());
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });
});
