import mongoose, { ENGINE_NAME } from "../db/odm.js";
import Attempt from "../models/Attempt.js";
import PublicAttempt from "../models/PublicAttempt.js";
import CbtAttempt from "../models/CbtAttempt.js";

// Storage cap shown on the meter, per database engine (in MB). Override any of
// these with the STORAGE_LIMIT_MB env var (e.g. if you upgrade a tier).
//   mongo  -> 512 MB  (MongoDB Atlas M0 free tier)
//   oracle -> 20 GB   (Oracle Autonomous Database "Always Free")
//   dynamo -> 25 GB   (AWS DynamoDB "Always Free")
const ENGINE_LIMIT_MB = { mongo: 512, oracle: 20 * 1024, dynamo: 25 * 1024 };
const ENGINE_LABEL = { mongo: "MongoDB", oracle: "Oracle Autonomous Database", dynamo: "AWS DynamoDB" };
const LIMIT_MB = Number(process.env.STORAGE_LIMIT_MB) || ENGINE_LIMIT_MB[ENGINE_NAME] || 512;
const MB = 1048576;
const toMB = (bytes) => Math.round(((bytes || 0) / MB) * 10) / 10;
const cutoffFor = (days) => new Date(Date.now() - Math.max(1, Number(days) || 90) * 86400000);

// GET /api/admin/storage?days=90
// Storage usage overview: total data size vs the 512 MB free-tier limit, the
// biggest collections, and how many old attempt records could be cleaned up.
export async function storageStats(req, res) {
  const days = Math.max(1, Math.min(3650, parseInt(req.query?.days, 10) || 90));
  const cutoff = cutoffFor(days);

  // Which database is actually connected (shown on the page).
  const engine = ENGINE_NAME;
  const engineLabel = ENGINE_LABEL[engine] || engine;
  const db = mongoose.connection?.db;

  // Live size + per-collection breakdown come from the database's own stats.
  // Available on MongoDB and on Oracle (via the MongoDB API); DynamoDB has no
  // server-side size command, so we report liveSize:false and skip those.
  let dataMB = 0;
  let indexMB = 0;
  let storageMB = 0;
  let objects = 0;
  let collections = [];
  let liveSize = false;

  if (db && typeof db.stats === "function") {
    try {
      const dbStats = await db.stats();
      dataMB = toMB(dbStats.dataSize);
      indexMB = toMB(dbStats.indexSize);
      storageMB = toMB(dbStats.storageSize);
      objects = dbStats.objects || 0;
      liveSize = true;
      // Per-collection sizes (data + indexes), biggest first.
      try {
        const names = (await db.listCollections().toArray()).map((c) => c.name);
        const per = await Promise.all(
          names.map(async (name) => {
            try {
              const s = await db.command({ collStats: name });
              return { name, dataMB: toMB(s.size), storageMB: toMB(s.storageSize), indexMB: toMB(s.totalIndexSize), docs: s.count || 0 };
            } catch {
              return { name, dataMB: 0, storageMB: 0, indexMB: 0, docs: 0 };
            }
          })
        );
        collections = per.sort((a, b) => (b.dataMB + b.indexMB) - (a.dataMB + a.indexMB)).slice(0, 15);
      } catch {
        collections = [];
      }
    } catch {
      liveSize = false;
    }
  }

  // How many old records the cleanup would affect (works on every engine).
  const [oldUser, oldPublic, oldCbt, oldCbtWithReview] = await Promise.all([
    Attempt.countDocuments({ createdAt: { $lt: cutoff } }),
    PublicAttempt.countDocuments({ createdAt: { $lt: cutoff } }),
    CbtAttempt.countDocuments({ createdAt: { $lt: cutoff } }),
    CbtAttempt.countDocuments({ createdAt: { $lt: cutoff }, review: { $exists: true } }),
  ]);

  const totalMB = Math.round((dataMB + indexMB) * 10) / 10; // data + indexes ~ what counts against the cap
  res.set("Cache-Control", "no-store");
  res.json({
    engine,
    engineLabel,
    liveSize,
    limitMB: LIMIT_MB,
    dataMB,
    indexMB,
    storageMB,
    totalMB,
    usedPct: LIMIT_MB ? Math.min(100, Math.round((totalMB / LIMIT_MB) * 100)) : 0,
    objects,
    collections,
    days,
    cleanup: {
      userAttempts: oldUser,
      publicAttempts: oldPublic,
      cbtAttempts: oldCbt,
      cbtWithReview: oldCbtWithReview,
    },
  });
}

// POST /api/admin/storage/cleanup
// Body: { days, userAttempts, publicAttempts, cbtAttempts, stripCbtReview }
// Deletes the selected kinds of attempt records older than `days` (and/or drops
// only the heavy `review` snapshot from old CBT attempts, keeping their scores).
export async function cleanupAttempts(req, res) {
  const b = req.body || {};
  const cutoff = cutoffFor(b.days);
  const result = { deletedUserAttempts: 0, deletedPublicAttempts: 0, deletedCbtAttempts: 0, strippedCbtReview: 0 };

  if (b.userAttempts) {
    const r = await Attempt.deleteMany({ createdAt: { $lt: cutoff } });
    result.deletedUserAttempts = r.deletedCount || 0;
  }
  if (b.publicAttempts) {
    const r = await PublicAttempt.deleteMany({ createdAt: { $lt: cutoff } });
    result.deletedPublicAttempts = r.deletedCount || 0;
  }
  if (b.cbtAttempts) {
    const r = await CbtAttempt.deleteMany({ createdAt: { $lt: cutoff } });
    result.deletedCbtAttempts = r.deletedCount || 0;
  } else if (b.stripCbtReview) {
    // Only strip the review snapshot when NOT deleting the whole attempt.
    const r = await CbtAttempt.updateMany(
      { createdAt: { $lt: cutoff }, review: { $exists: true } },
      { $unset: { review: "" } },
      { timestamps: false }
    );
    result.strippedCbtReview = r.modifiedCount || 0;
  }

  res.set("Cache-Control", "no-store");
  res.json({ message: "Cleanup complete.", ...result });
}
