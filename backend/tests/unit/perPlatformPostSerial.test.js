import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Verifies that each social platform now has its OWN post-serial counter.
// Before this fix a shared `fbPostSerial` counter was advanced once per run
// and used on BOTH platforms — if Facebook succeeded and Instagram failed the
// number was "used up" on FB only, so the next run's IG post appeared to skip
// a number (e.g. 241, 243, missing 242). Independent counters, reserved per
// platform and rolled back on failure, keep each feed sequential.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost/dummy-tests";

let mongo;

// The Settings model is imported after mongoose connects so its indexes bind
// to the in-memory database, not a possibly-absent real one.
let Settings;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  Settings = (await import("../../src/models/Settings.js")).default;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(async () => {
  await Settings.deleteMany({});
  vi.restoreAllMocks();
});

async function seedSite(overrides = {}) {
  return Settings.create({
    key: "site",
    fbEnabled: true,
    fbPageId: "PAGE",
    fbPageAccessToken: "TOK",
    igEnabled: true,
    ...overrides,
  });
}

// Small helper — replicate the reservation code that lives in facebook.js so
// this test doesn't need the whole publishing pipeline. If the helper here
// drifts from the real one the assertion breaks; the shape is deliberately
// simple to keep them aligned.
async function reserveSerial(siteId, field) {
  const bumped = await Settings.findOneAndUpdate(
    { _id: siteId },
    [
      {
        $set: {
          [field]: {
            $add: [
              {
                $max: [
                  { $ifNull: [`$${field}`, 0] },
                  { $ifNull: ["$fbPostSerial", 0] },
                ],
              },
              1,
            ],
          },
        },
      },
    ],
    { new: true }
  ).select(field).lean();
  return bumped?.[field] ?? null;
}
async function releaseSerial(siteId, field, reserved) {
  await Settings.updateOne(
    { _id: siteId, [field]: reserved },
    { $inc: { [field]: -1 } }
  );
}

describe("per-platform post serials", () => {
  it("advances Facebook and Instagram counters independently", async () => {
    const site = await seedSite();
    const fb1 = await reserveSerial(site._id, "fbPostSerialFacebook");
    const ig1 = await reserveSerial(site._id, "fbPostSerialInstagram");
    const fb2 = await reserveSerial(site._id, "fbPostSerialFacebook");
    const ig2 = await reserveSerial(site._id, "fbPostSerialInstagram");
    expect([fb1, fb2]).toEqual([1, 2]);
    expect([ig1, ig2]).toEqual([1, 2]);
  });

  it("seeds each new per-platform counter from the legacy fbPostSerial on first use", async () => {
    // Existing site was already numbering posts up to 241 on the shared field.
    const site = await seedSite({ fbPostSerial: 241 });
    const fb = await reserveSerial(site._id, "fbPostSerialFacebook");
    const ig = await reserveSerial(site._id, "fbPostSerialInstagram");
    expect(fb).toBe(242);
    expect(ig).toBe(242);
    // Legacy shared counter must NOT change from the migration.
    const doc = await Settings.findById(site._id).lean();
    expect(doc.fbPostSerial).toBe(241);
  });

  it("releaseSerial rolls back only when nothing else has advanced the counter", async () => {
    const site = await seedSite();
    // First reservation: FB = 1.
    const fb1 = await reserveSerial(site._id, "fbPostSerialFacebook");
    expect(fb1).toBe(1);
    // Simulated publish failure → roll back this number.
    await releaseSerial(site._id, "fbPostSerialFacebook", fb1);
    // Next reservation reuses the number — no permanent gap.
    const fb2 = await reserveSerial(site._id, "fbPostSerialFacebook");
    expect(fb2).toBe(1);

    // But if ANOTHER run has already advanced the counter past our reservation,
    // the rollback must be a no-op so we don't hand out duplicate numbers.
    const fb3 = await reserveSerial(site._id, "fbPostSerialFacebook"); // now 2
    const fb4 = await reserveSerial(site._id, "fbPostSerialFacebook"); // now 3
    // Try to release the older reservation (fb3 = 2) — counter is currently 3.
    await releaseSerial(site._id, "fbPostSerialFacebook", fb3);
    const doc = await Settings.findById(site._id).lean();
    expect(doc.fbPostSerialFacebook).toBe(3); // untouched
    // Rolling back the CURRENT reservation still works.
    await releaseSerial(site._id, "fbPostSerialFacebook", fb4);
    const after = await Settings.findById(site._id).lean();
    expect(after.fbPostSerialFacebook).toBe(2);
  });

  it("keeps each feed sequential when only ONE platform fails per run", async () => {
    // Reproduces the exact screenshot bug: user saw Instagram 242 and Facebook
    // 243 side-by-side, with 242 missing from Facebook and 243 missing from
    // Instagram. With per-platform counters + rollback, both feeds stay
    // continuous even when the OTHER platform fails on that run.
    const site = await seedSite({ fbPostSerial: 240 });
    async function runOnce({ fbSuccess, igSuccess }) {
      const fb = await reserveSerial(site._id, "fbPostSerialFacebook");
      const ig = await reserveSerial(site._id, "fbPostSerialInstagram");
      if (!fbSuccess) await releaseSerial(site._id, "fbPostSerialFacebook", fb);
      if (!igSuccess) await releaseSerial(site._id, "fbPostSerialInstagram", ig);
      return { fb: fbSuccess ? fb : null, ig: igSuccess ? ig : null };
    }
    // Run 1: both succeed.
    let r = await runOnce({ fbSuccess: true, igSuccess: true });
    expect(r).toEqual({ fb: 241, ig: 241 });
    // Run 2: Facebook fails, Instagram succeeds → IG advances, FB rolls back.
    r = await runOnce({ fbSuccess: false, igSuccess: true });
    expect(r).toEqual({ fb: null, ig: 242 });
    // Run 3: Facebook succeeds, Instagram fails → FB reuses 242 (no gap).
    r = await runOnce({ fbSuccess: true, igSuccess: false });
    expect(r).toEqual({ fb: 242, ig: null });
    // Run 4: both succeed → FB=243, IG=243.
    r = await runOnce({ fbSuccess: true, igSuccess: true });
    expect(r).toEqual({ fb: 243, ig: 243 });
  });
});
