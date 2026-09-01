import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Tests for the super-admin "Share content to institutes" cross-tenant COPY.
// Verifies each of the 4 areas duplicates a whole node into a target tenant as
// its own content (owner:null, tenantId = target), copies the questions, does
// NOT touch the source, and stays isolated to the target institute.

const INSTITUTE = "abcabcabcabcabcabcabcabc";
const OTHER = "def0def0def0def0def0def0";

let mongoose, mongod, runUnscoped, runWithTenant;
let PracticeStream, PracticeExam, PracticeSubject, PracticeTopic;
let Stream, Subject, Topic, Session, Quiz, Exam, ExamPost, TestSeries, Question;
let shareNodeToTenant;

let n = 0;
const uniq = () => `${Date.now()}-${n++}`;

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "institute_share_test" });

  await import("../src/config/registerModelPlugins.js");
  PracticeStream = (await import("../src/models/PracticeStream.js")).default;
  PracticeExam = (await import("../src/models/PracticeExam.js")).default;
  PracticeSubject = (await import("../src/models/PracticeSubject.js")).default;
  PracticeTopic = (await import("../src/models/PracticeTopic.js")).default;
  Stream = (await import("../src/models/Stream.js")).default;
  Subject = (await import("../src/models/Subject.js")).default;
  Topic = (await import("../src/models/Topic.js")).default;
  Session = (await import("../src/models/Session.js")).default;
  Quiz = (await import("../src/models/Quiz.js")).default;
  Exam = (await import("../src/models/Exam.js")).default;
  ExamPost = (await import("../src/models/ExamPost.js")).default;
  TestSeries = (await import("../src/models/TestSeries.js")).default;
  Question = (await import("../src/models/Question.js")).default;
  ({ runUnscoped, runWithTenant } = await import("../src/utils/tenantContext.js"));
  ({ shareNodeToTenant } = await import("../src/utils/instituteShare.js"));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// Count docs owned by a tenant, ignoring auto-scope (explicit tenantId filter).
const countFor = (Model, tenantId, extra = {}) => runUnscoped(() => Model.countDocuments({ tenantId, ...extra }));

describe("my-quiz: copy a whole practice stream into an institute", () => {
  let streamId;
  beforeAll(async () => {
    await runUnscoped(async () => {
      const s = await PracticeStream.create({ name: `PS ${uniq()}`, kind: "quiz", tenantId: null });
      const e = await PracticeExam.create({ name: `PE ${uniq()}`, stream: s._id, tenantId: null });
      const sub = await PracticeSubject.create({ name: `PSub ${uniq()}`, stream: s._id, exam: e._id, tenantId: null });
      const top = await PracticeTopic.create({ name: `PT ${uniq()}`, subject: sub._id, tenantId: null });
      const item = await TestSeries.create({
        name: `Quiz ${uniq()}`, practice: true, practiceKind: "quiz",
        practiceStream: s._id, practiceExam: e._id, practiceSubject: sub._id, practiceTopic: top._id,
        category: "Full-Length", duration: 10, marks: 10, tenantId: null,
      });
      await Question.create({ text: "Q1?", type: "mcq", options: ["a", "b", "c", "d"], correct: 0, testSeries: item._id, tenantId: null });
      await Question.create({ text: "Q2?", type: "mcq", options: ["a", "b", "c", "d"], correct: 1, testSeries: item._id, tenantId: null });
      streamId = s._id;
    });
  });

  it("copies the stream + item + questions into the target tenant", async () => {
    const res = await shareNodeToTenant({ area: "my-quiz", id: streamId, tenantId: INSTITUTE });
    expect(res.items).toBe(1);
    expect(res.questions).toBe(2);
    expect(await countFor(PracticeStream, INSTITUTE)).toBe(1);
    expect(await countFor(TestSeries, INSTITUTE, { practice: true })).toBe(1);
    expect(await countFor(Question, INSTITUTE)).toBe(2);
    // The copy is platform content INSIDE the institute (owner null).
    const copy = await runUnscoped(() => TestSeries.findOne({ tenantId: INSTITUTE, practice: true }).lean());
    expect(copy.owner ?? null).toBeNull();
  });

  it("does not leak the copy to another institute", async () => {
    expect(await countFor(TestSeries, OTHER, { practice: true })).toBe(0);
  });

  it("leaves the source (null-tenant) content untouched", async () => {
    const srcItems = await runUnscoped(() => TestSeries.countDocuments({ tenantId: null, practice: true }));
    expect(srcItems).toBe(1);
  });
});

describe("public-quiz: copy a public stream (global-unique names) into an institute", () => {
  let streamId, baseName;
  beforeAll(async () => {
    await runUnscoped(async () => {
      baseName = `Stream ${uniq()}`;
      const s = await Stream.create({ name: baseName, slug: `stream-${uniq()}`, tenantId: null });
      const sub = await Subject.create({ name: `Sub ${uniq()}`, slug: `sub-${uniq()}`, stream: s._id, tenantId: null });
      const top = await Topic.create({ title: `Top ${uniq()}`, subject: sub._id, tenantId: null });
      const sess = await Session.create({ title: `Sess ${uniq()}`, subject: sub._id, topic: top._id, tenantId: null });
      const quiz = await Quiz.create({ title: `Quiz ${uniq()}`, subject: sub._id, session: sess._id, tenantId: null });
      await Question.create({ text: "PQ1?", type: "mcq", options: ["a", "b", "c", "d"], correct: 0, quiz: quiz._id, subject: sub._id, session: sess._id, tenantId: null });
      streamId = s._id;
    });
  });

  it("copies the whole public-quiz tree into the target tenant with collision-safe names", async () => {
    const res = await shareNodeToTenant({ area: "public-quiz", id: streamId, tenantId: INSTITUTE });
    expect(res.items).toBe(1); // one quiz
    expect(res.questions).toBe(1);
    expect(await countFor(Stream, INSTITUTE)).toBe(1);
    expect(await countFor(Subject, INSTITUTE)).toBe(1);
    expect(await countFor(Quiz, INSTITUTE)).toBe(1);
    // The source Stream name is taken (global unique), so the copy is suffixed.
    const copyStream = await runUnscoped(() => Stream.findOne({ tenantId: INSTITUTE }).lean());
    expect(copyStream.name).toContain("(shared)");
  });
});

describe("public-test: copy a whole exam (posts + test series + questions)", () => {
  let examId;
  beforeAll(async () => {
    await runUnscoped(async () => {
      const ex = await Exam.create({ name: `Exam ${uniq()}`, tenantId: null });
      const post = await ExamPost.create({ name: `Post ${uniq()}`, exam: ex._id, tenantId: null });
      const t = await TestSeries.create({
        name: `Test ${uniq()}`, exam: ex._id, post: post._id,
        category: "Full-Length", duration: 60, marks: 100, status: "published", tenantId: null,
      });
      await Question.create({ text: "TQ1?", type: "mcq", options: ["a", "b", "c", "d"], correct: 0, testSeries: t._id, tenantId: null });
      examId = ex._id;
    });
  });

  it("copies the exam, post, test series and questions into the target tenant", async () => {
    const res = await shareNodeToTenant({ area: "public-test", id: examId, tenantId: INSTITUTE });
    expect(res.items).toBe(1);
    expect(res.questions).toBe(1);
    expect(await countFor(Exam, INSTITUTE)).toBe(1);
    expect(await countFor(ExamPost, INSTITUTE)).toBe(1);
    // A non-practice test series now exists under the institute.
    expect(await countFor(TestSeries, INSTITUTE, { exam: { $ne: null }, practice: { $ne: true } })).toBe(1);
  });
});
