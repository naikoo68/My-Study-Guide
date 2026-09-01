import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Extends the platform-sharing gate to the "My Practice" / "My Quiz" hierarchy.
// Regression for: an institute with sharing OFF still saw the super-admin's
// PracticeStreams (e.g. "A", "JKPSC") under My Quizzes, because the practice
// models weren't gated by shareContent.

const INSTITUTE = "ffffffffffffffffffffffff";

let mongoose;
let mongod;
let models;
let runWithTenant;
let runUnscoped;

let n = 0;
const uniq = () => `${Date.now()}-${n++}`;

const asInstitute = (share, fn) =>
  runWithTenant({ tenantId: INSTITUTE, bypass: false, shareContent: share, shareAiKeys: false }, async () => await fn());

const factories = {
  PracticeStream: () => ({ name: `PS ${uniq()}`, slug: `ps-${uniq()}` }),
  PracticeSubject: () => ({ name: `PSub ${uniq()}`, stream: new mongoose.Types.ObjectId() }),
  PracticeTopic: () => ({ name: `PT ${uniq()}`, subject: new mongoose.Types.ObjectId() }),
};

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "practice_sharing_test" });
  await import("../src/config/registerModelPlugins.js");
  models = {
    PracticeStream: (await import("../src/models/PracticeStream.js")).default,
    PracticeSubject: (await import("../src/models/PracticeSubject.js")).default,
    PracticeTopic: (await import("../src/models/PracticeTopic.js")).default,
  };
  ({ runWithTenant, runUnscoped } = await import("../src/utils/tenantContext.js"));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

for (const level of ["PracticeStream", "PracticeSubject", "PracticeTopic"]) {
  describe(`platform practice sharing — ${level}`, () => {
    let platform;
    let own;
    beforeAll(async () => {
      const M = models[level];
      platform = await runUnscoped(() => M.create(factories[level]())); // super-admin (tenantId null)
      own = await asInstitute(false, () => M.create(factories[level]())); // institute's own
    });

    it("OFF: institute sees only its own, not the platform's", async () => {
      const ids = (await asInstitute(false, () => models[level].find({}).lean())).map((x) => String(x._id));
      expect(ids).toContain(String(own._id));
      expect(ids).not.toContain(String(platform._id));
    });

    it("OFF: institute cannot read a platform record by id", async () => {
      expect(await asInstitute(false, () => models[level].findById(platform._id).lean())).toBeNull();
    });

    it("ON: institute sees the platform's too", async () => {
      const ids = (await asInstitute(true, () => models[level].find({}).lean())).map((x) => String(x._id));
      expect(ids).toContain(String(platform._id));
    });
  });
}
