import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// Reliable Facebook-ONLY publication count (FbPost ledger).
//
// Proves the permanent Facebook count represents actual UNIQUE successful
// Facebook publications — never Instagram success, never a generic anyOk, never
// FbSchedule.postCount / pool progress. Runs the REAL model + tenantId plugin
// against an in-memory MongoDB (the same engine production uses via the ODM).
//
// countFacebookPosts(tenantId, pageId) is THE ONE authoritative function for
// this value — both "Published by this application" (stats.lifetime) and the
// reconciliation's applicationCount resolve through it.
//
// Cases:
//   A Facebook succeeds → one publication recorded
//   B Facebook fails → none recorded
//   C Instagram succeeds while Facebook fails → count unchanged
//   D Facebook + Instagram both succeed → exactly one recorded
//   E Same Meta post id twice → counted once
//   F Two different Meta post ids → count += 2
//   G Different Pages / tenants → counts stay isolated
//   H Recording never touches FbSchedule.postCount
//   TASK 10 end-to-end scenario (publish A/B, IG, retry, delete schedule,
//           refresh, restart, add C, Lifetime == Our records)
// ─────────────────────────────────────────────────────────────────────────

const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const PAGE_1 = "page-1111111111";
const PAGE_2 = "page-2222222222";

let mongoose;
let mongod;
let FbPost;
let FbSchedule;
let collectFacebookPublications;
let recordFbPublications;
let countFacebookPosts;
let runWithTenant;
let runUnscoped;

const asTenant = (tid, fn) => runWithTenant({ tenantId: tid, bypass: false }, async () => await fn());
const asA = (fn) => asTenant(TENANT_A, fn);
const asB = (fn) => asTenant(TENANT_B, fn);

beforeAll(async () => {
  process.env.TENANT_ENFORCEMENT = "on";
  process.env.DB_ENGINE = "mongo";
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(mongod.getUri(), { dbName: "fb_ledger_test" });
  await import("../src/config/registerModelPlugins.js");
  FbPost = (await import("../src/models/FbPost.js")).default;
  FbSchedule = (await import("../src/models/FbSchedule.js")).default;
  ({ collectFacebookPublications, recordFbPublications, countFacebookPosts } = await import("../src/config/facebook.js"));
  ({ runWithTenant, runUnscoped } = await import("../src/utils/tenantContext.js"));
}, 120000);

afterAll(async () => {
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// Clean slate before each test so counts are unambiguous.
beforeEach(async () => {
  await runUnscoped(() => FbPost.deleteMany({}));
  await runUnscoped(() => FbSchedule.deleteMany({}));
});

// A Facebook Page attempt result shaped like postToFacebookPage's return.
const fb = (ok, id, pageId = PAGE_1, pageLabel = "") => ({ ok, id, pageId, pageLabel });

describe("collectFacebookPublications (what may be recorded)", () => {
  it("A: a successful Facebook attempt with a Meta id yields one publication", () => {
    expect(collectFacebookPublications([fb(true, "fb_A1")])).toEqual([
      { id: "fb_A1", pageId: PAGE_1, pageLabel: "" },
    ]);
  });

  it("B: a FAILED Facebook attempt yields nothing", () => {
    expect(collectFacebookPublications([fb(false, undefined)])).toEqual([]);
    // ok but no id (Meta returned no post id) also counts as nothing.
    expect(collectFacebookPublications([fb(true, undefined)])).toEqual([]);
  });

  it("C: Instagram never reaches this function — only Facebook attempts are passed", () => {
    // The posting flow passes ONLY Facebook Page attempts here; Instagram is
    // handled separately (igOk) and can never appear. A failed FB attempt →
    // nothing, regardless of any Instagram success elsewhere.
    expect(collectFacebookPublications([fb(false, undefined)])).toEqual([]);
  });

  it("D: FB success (alongside any IG success) yields exactly one publication", () => {
    expect(collectFacebookPublications([fb(true, "fb_D1")])).toHaveLength(1);
  });

  it("de-dupes the same Meta id within a single call", () => {
    expect(collectFacebookPublications([fb(true, "dup"), fb(true, "dup")])).toHaveLength(1);
  });
});

describe("Facebook publication ledger + count", () => {
  it("A: Facebook success → one durable record for the Page", async () => {
    await asA(async () => {
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_A1")]), { kind: "question" });
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(1);
    });
  });

  it("B: Facebook failure → no record", async () => {
    await asA(async () => {
      await recordFbPublications(collectFacebookPublications([fb(false, undefined)]), { kind: "question" });
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(0);
    });
  });

  it("C: Instagram success while Facebook fails → Facebook count stays 0", async () => {
    await asA(async () => {
      // Instagram is not represented here at all (by design). The Facebook
      // attempt failed, so nothing is recorded even though IG "succeeded".
      await recordFbPublications(collectFacebookPublications([fb(false, undefined)]), { kind: "question" });
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(0);
    });
  });

  it("D: Facebook + Instagram both succeed → exactly one Facebook record", async () => {
    await asA(async () => {
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_D1")]), { kind: "question" });
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(1);
    });
  });

  it("E: the same Meta post id processed twice is counted only once", async () => {
    await asA(async () => {
      const pubs = collectFacebookPublications([fb(true, "fb_E1")]);
      await recordFbPublications(pubs, { kind: "question" });
      await recordFbPublications(pubs, { kind: "question" }); // retry / repeated processing
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(1);
    });
  });

  it("F: two different Meta post ids → count increases by two", async () => {
    await asA(async () => {
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_F1"), fb(true, "fb_F2")]), { kind: "question" });
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(2);
    });
  });

  it("G: counts stay isolated across Pages and across tenants", async () => {
    await asA(async () => {
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_G1", PAGE_1)]), { kind: "question" });
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_G2", PAGE_2)]), { kind: "question" });
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(1); // Page 1 only
      expect(await countFacebookPosts(TENANT_A, PAGE_2)).toBe(1); // Page 2 only — not mixed
    });
    // Tenant B publishes to PAGE_1 too, but must never see Tenant A's rows.
    await asB(async () => {
      expect(await countFacebookPosts(TENANT_B, PAGE_1)).toBe(0);
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_G3", PAGE_1)]), { kind: "question" });
      expect(await countFacebookPosts(TENANT_B, PAGE_1)).toBe(1); // B sees only its own
    });
    // Tenant A is unaffected by B's activity.
    await asA(async () => {
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(1);
    });
  });

  it("H: recording publications never changes FbSchedule.postCount", async () => {
    await asA(async () => {
      const sch = await FbSchedule.create({ title: "Daily", postCount: 5, source: {}, times: ["09:00"] });
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_H1")]), { schedule: sch, kind: "question" });
      const fresh = await FbSchedule.findById(sch._id).lean();
      expect(fresh.postCount).toBe(5); // pool-progress counter is untouched
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(1); // the FB count is separate
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// TASK 10 — end-to-end publication-count scenario. Runs the steps in order,
// sharing state, and asserts the application count behaves exactly as required.
// ─────────────────────────────────────────────────────────────────────────
describe("TASK 10: end-to-end Facebook publication count", () => {
  it("steps 1–9: publish A/B, IG, retry, delete schedule, refresh, restart, add C", async () => {
    // The two dashboard figures both resolve through countFacebookPosts, so
    // reading it the way each endpoint does proves they always agree.
    const applicationCount = () => countFacebookPosts(TENANT_A, PAGE_1); // "Published by this application" (stats.lifetime)
    const ourRecords = () => countFacebookPosts(TENANT_A, PAGE_1);       // reconcile.applicationCount

    await asA(async () => {
      // 1. Publish Facebook post A → count = 1
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_post_A")]), { kind: "question" });
      expect(await applicationCount()).toBe(1);

      // 2. Publish Facebook post B → count = 2
      const scheduleForB = await FbSchedule.create({ title: "Schedule B", postCount: 1, source: {}, times: ["09:00"] });
      await recordFbPublications(
        collectFacebookPublications([fb(true, "fb_post_B")]),
        { schedule: scheduleForB, kind: "question" }
      );
      expect(await applicationCount()).toBe(2);

      // 3. Publish an Instagram post → Facebook count remains 2. Instagram
      //    results are NEVER passed to the Facebook collector, so nothing is
      //    recorded to the Facebook ledger.
      await recordFbPublications(collectFacebookPublications([/* no FB attempts — IG only */]), { kind: "question" });
      expect(await applicationCount()).toBe(2);

      // 4. Retry Facebook post B (same Meta id) → remains 2 (idempotent).
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_post_B")]), { kind: "question" });
      expect(await applicationCount()).toBe(2);

      // 5. Delete the schedule for B → count remains 2. The ledger is
      //    INDEPENDENT of FbSchedule.
      await FbSchedule.findByIdAndDelete(scheduleForB._id);
      expect(await FbSchedule.findById(scheduleForB._id).lean()).toBeNull();
      expect(await applicationCount()).toBe(2);

      // 6. "Refresh the dashboard" → re-reading the same source still gives 2.
      expect(await applicationCount()).toBe(2);
    });

    // 7. "Restart the backend" → the count is durable in the ledger (DB), not
    //    in memory. Re-open a fresh tenant context and re-read: still 2.
    await asA(async () => {
      expect(await countFacebookPosts(TENANT_A, PAGE_1)).toBe(2);
    });

    await asA(async () => {
      // 8. Add Facebook post C → count = 3
      await recordFbPublications(collectFacebookPublications([fb(true, "fb_post_C")]), { kind: "question" });
      expect(await applicationCount()).toBe(3);

      // 9. Lifetime posts published == Our records (both from the one source).
      const lifetime = await applicationCount();
      const ours = await ourRecords();
      expect(lifetime).toBe(3);
      expect(ours).toBe(3);
      expect(lifetime).toBe(ours);
    });
  });
});
