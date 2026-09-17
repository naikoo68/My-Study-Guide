import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Regression test for the bug where the auto-post "drill-down" breadcrumb
// (Stream › Subject › Topic › Quiz) only showed a full trail for questions that
// happened to have their OWN `subject`/`session` fields populated (e.g. plain
// MCQs added a certain way). Questions that carried only `quiz` — common for
// several question types / import flows — got a broken, subject-less trail.
//
// breadcrumbForQuestion now walks the hierarchy from the quiz (which always has
// subject + session), so EVERY question under a quiz resolves the full trail
// regardless of type or which of its own fields are set. This drives the REAL
// function against an in-memory MongoDB with the real Mongoose models.

let mongoose, mongod, runUnscoped;
let Stream, Subject, Topic, Session, Quiz, Question;
let breadcrumbForQuestion;

beforeAll(async () => {
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "breadcrumb_test" });

  await import("../src/config/registerModelPlugins.js");
  Stream = (await import("../src/models/Stream.js")).default;
  Subject = (await import("../src/models/Subject.js")).default;
  Topic = (await import("../src/models/Topic.js")).default;
  Session = (await import("../src/models/Session.js")).default;
  Quiz = (await import("../src/models/Quiz.js")).default;
  Question = (await import("../src/models/Question.js")).default;
  ({ runUnscoped } = await import("../src/utils/tenantContext.js"));
  ({ breadcrumbForQuestion } = await import("../src/config/facebook.js"));
});

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("breadcrumbForQuestion resolves the full drill-down for ALL questions under a quiz", () => {
  const EXPECTED = "JKSSB › Economics › Banking › Quiz 10";

  it("builds Stream › Subject › Topic › Quiz for questions of every type", async () => {
    await runUnscoped(async () => {
      const stream = await Stream.create({ name: "JKSSB", slug: "jkssb" });
      const subject = await Subject.create({ name: "Economics", slug: "economics", stream: stream._id });
      const topic = await Topic.create({ title: "Banking", subject: subject._id });
      const session = await Session.create({ title: "Quizzes", subject: subject._id, topic: topic._id });
      const quiz = await Quiz.create({ title: "Quiz 10", subject: subject._id, session: session._id });

      // 1) A plain MCQ with the FULL set of fields (the case that already worked).
      const mcq = await Question.create({
        type: "mcq", text: "Q?", options: ["a", "b", "c", "d"], correct: 0, status: "published",
        subject: subject._id, session: session._id, quiz: quiz._id,
      });

      // 2) A non-MCQ (assertion) with ONLY the quiz set — no subject, no session.
      //    This used to produce a broken/short trail; it must now be full.
      const assertion = await Question.create({
        type: "assertion", text: "A?", assertion: "A", reason: "R",
        options: ["a", "b", "c", "d"], correct: 1, status: "published",
        quiz: quiz._id,
      });

      // 3) A matching question, also with only the quiz set.
      const matching = await Question.create({
        type: "matching", text: "Match", columnA: ["x"], columnB: ["y"],
        options: ["1-x"], correct: 0, status: "published",
        quiz: quiz._id,
      });

      expect(await breadcrumbForQuestion(mcq)).toBe(EXPECTED);
      expect(await breadcrumbForQuestion(assertion)).toBe(EXPECTED);
      expect(await breadcrumbForQuestion(matching)).toBe(EXPECTED);
    });
  });

  it("returns an empty string for a question with no hierarchy at all", async () => {
    await runUnscoped(async () => {
      const orphan = await Question.create({
        type: "mcq", text: "Orphan", options: ["a", "b", "c", "d"], correct: 0, status: "published",
      });
      expect(await breadcrumbForQuestion(orphan)).toBe("");
    });
  });
});
