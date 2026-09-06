import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Integration tests for the content CRUD controllers (streams + subjects),
// driving the REAL controller functions against an in-memory MongoDB. Tenant
// enforcement is OFF here (like contentMoveGuard) so we exercise the plain CRUD
// paths: create / list / rename / soft-delete, name-collision guards, and the
// "reuse a subject across streams" linking behaviour.

let mongoose;
let mongod;
let Stream;
let Subject;
let c; // contentController namespace

const mkRes = () => ({
  statusCode: 200,
  payload: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.payload = body; return this; },
  set() { return this; },
});
const admin = { role: "admin" };
const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  delete process.env.TENANT_ENFORCEMENT; // enforcement OFF for plain CRUD paths
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "content_crud_test" });
  await import("../src/config/registerModelPlugins.js");
  Stream = (await import("../src/models/Stream.js")).default;
  Subject = (await import("../src/models/Subject.js")).default;
  c = await import("../src/controllers/contentController.js");
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("Stream CRUD", () => {
  it("creates a stream and lists it back", async () => {
    const res = mkRes();
    await c.createStream({ body: { name: "SSC Exams", color: "#123" }, user: admin }, res);
    expect(res.statusCode).toBe(201);
    expect(res.payload.name).toBe("SSC Exams");
    expect(res.payload.slug).toBe("ssc-exams");

    const listRes = mkRes();
    await c.listStreams({ user: admin, query: {}, headers: {} }, listRes);
    const names = listRes.payload.map((s) => s.name);
    expect(names).toContain("SSC Exams");
    const created = listRes.payload.find((s) => s.name === "SSC Exams");
    expect(created.subjects).toBe(0); // new stream has no content yet
  });

  it("rejects a duplicate stream name", async () => {
    const res = mkRes();
    await c.createStream({ body: { name: "Banking" }, user: admin }, mkRes());
    await c.createStream({ body: { name: "Banking" }, user: admin }, res);
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/already exists|different name/i);
  });

  it("renames a stream (and updates its slug)", async () => {
    const create = mkRes();
    await c.createStream({ body: { name: "Rail" }, user: admin }, create);
    const id = String(create.payload._id);

    const res = mkRes();
    await c.updateStream({ params: { id }, body: { name: "Railways" }, user: admin }, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.name).toBe("Railways");
    expect(res.payload.slug).toBe("railways");
  });

  it("returns 404 when updating a non-existent stream", async () => {
    const res = mkRes();
    await c.updateStream({ params: { id: String(oid()) }, body: { name: "Ghost" }, user: admin }, res);
    expect(res.statusCode).toBe(404);
  });

  it("soft-deletes a stream (Recycle Bin) and hides it from the list", async () => {
    const create = mkRes();
    await c.createStream({ body: { name: "Temp Stream" }, user: admin }, create);
    const id = String(create.payload._id);

    const del = mkRes();
    await c.deleteStream({ params: { id }, user: admin }, del);
    expect(del.statusCode).toBe(200);
    expect(del.payload.softDeleted).toBe(true);

    const listRes = mkRes();
    await c.listStreams({ user: admin, query: {}, headers: {} }, listRes);
    expect(listRes.payload.find((s) => s.name === "Temp Stream")).toBeUndefined();
  });
});

describe("Subject CRUD + cross-stream reuse", () => {
  it("creates a subject under a stream", async () => {
    const s = await Stream.create({ name: "Home Stream A", slug: "home-stream-a" });
    const res = mkRes();
    await c.createSubject({ body: { name: "Quantitative Aptitude", stream: String(s._id) }, user: admin }, res);
    expect(res.statusCode).toBe(201);
    expect(res.payload.name).toBe("Quantitative Aptitude");
  });

  it("rejects a duplicate subject within the same stream", async () => {
    const s = await Stream.create({ name: "Home Stream B", slug: "home-stream-b" });
    await c.createSubject({ body: { name: "Reasoning", stream: String(s._id) }, user: admin }, mkRes());
    const res = mkRes();
    await c.createSubject({ body: { name: "Reasoning", stream: String(s._id) }, user: admin }, res);
    expect(res.statusCode).toBe(409);
  });

  it("LINKS an existing subject into a different stream instead of duplicating", async () => {
    const home = await Stream.create({ name: "Home Stream C", slug: "home-stream-c" });
    const other = await Stream.create({ name: "Other Stream C", slug: "other-stream-c" });
    const first = mkRes();
    await c.createSubject({ body: { name: "General Science", stream: String(home._id) }, user: admin }, first);
    const subjectId = String(first.payload._id);

    const res = mkRes();
    await c.createSubject({ body: { name: "General Science", stream: String(other._id) }, user: admin }, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.linked).toBe(true);

    const fresh = await Subject.findById(subjectId).lean();
    expect(fresh.streams.map(String)).toContain(String(other._id)); // linked, not duplicated
    expect(await Subject.countDocuments({ name: "General Science" })).toBe(1);
  });

  it("soft-deletes a subject", async () => {
    const s = await Stream.create({ name: "Home Stream D", slug: "home-stream-d" });
    const create = mkRes();
    await c.createSubject({ body: { name: "Static GK", stream: String(s._id) }, user: admin }, create);
    const del = mkRes();
    await c.deleteSubject({ params: { id: String(create.payload._id) }, user: admin }, del);
    expect(del.statusCode).toBe(200);
    expect(del.payload.softDeleted).toBe(true);
  });
});
