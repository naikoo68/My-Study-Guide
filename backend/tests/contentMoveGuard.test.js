import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Defense-in-depth test for contentController.moveQuestions / copyQuestions.
//
// The controller is invoked WITHOUT a tenant request context, so the tenantId
// plugin does NOT scope its queries (same effect as the TENANT_ENFORCEMENT
// switch being off). This isolates and proves the controllers' OWN explicit
// same-tenant guard: cross-institute move/copy is refused regardless of the
// plugin. A same-tenant move still works (positive control).

const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";

let mongoose;
let mongod;
let Quiz;
let Question;
let moveQuestions;
let copyQuestions;

const oid = () => new mongoose.Types.ObjectId();
const mkQuiz = (title, tenantId) => Quiz.create({ title, subject: oid(), session: oid(), tenantId });
const mkQuestion = (quiz, tenantId) =>
  Question.create({ text: `q-${Math.random()}`, type: "mcq", options: ["a", "b", "c", "d"], correct: 0, quiz, tenantId });

// Minimal Express-style res double that records status + body.
function mockRes() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    set() { return this; },
  };
}
const admin = { role: "admin" };

beforeAll(async () => {
  // Enforcement OFF for this suite — we're testing the controller's own guard,
  // not the plugin's scoping.
  delete process.env.TENANT_ENFORCEMENT;
  process.env.DB_ENGINE = "mongo";

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "move_guard_test" });

  await import("../src/config/registerModelPlugins.js"); // adds the tenantId field
  Quiz = (await import("../src/models/Quiz.js")).default;
  Question = (await import("../src/models/Question.js")).default;
  ({ moveQuestions, copyQuestions } = await import("../src/controllers/contentController.js"));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("content move/copy — explicit cross-tenant guard (plugin-independent)", () => {
  it("MOVE: refuses to move questions from Tenant A's quiz into Tenant B's quiz", async () => {
    const src = await mkQuiz("A source", A);
    const dst = await mkQuiz("B dest", B);
    const q = await mkQuestion(src._id, A);

    const req = { params: { id: String(src._id) }, body: { targetQuiz: String(dst._id), questionIds: [String(q._id)] }, user: admin };
    const res = mockRes();
    await moveQuestions(req, res);

    expect(res.statusCode).toBe(403);
    const fresh = await Question.findById(q._id).lean();
    expect(String(fresh.quiz)).toBe(String(src._id)); // not moved
  });

  it("COPY: refuses to copy questions across tenants", async () => {
    const src = await mkQuiz("A source c", A);
    const dst = await mkQuiz("B dest c", B);
    const q = await mkQuestion(src._id, A);

    const req = { params: { id: String(src._id) }, body: { targetQuiz: String(dst._id), questionIds: [String(q._id)] }, user: admin };
    const res = mockRes();
    await copyQuestions(req, res);

    expect(res.statusCode).toBe(403);
    const inDest = await Question.countDocuments({ quiz: dst._id });
    expect(inDest).toBe(0); // nothing copied in
  });

  it("positive control: a SAME-tenant move still works", async () => {
    const src = await mkQuiz("A source ok", A);
    const dst = await mkQuiz("A dest ok", A);
    const q = await mkQuestion(src._id, A);

    const req = { params: { id: String(src._id) }, body: { targetQuiz: String(dst._id), questionIds: [String(q._id)] }, user: admin };
    const res = mockRes();
    await moveQuestions(req, res);

    expect(res.statusCode).toBe(200);
    const fresh = await Question.findById(q._id).lean();
    expect(String(fresh.quiz)).toBe(String(dst._id)); // moved
  });
});
