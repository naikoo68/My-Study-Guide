import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { seedIfEmpty } from "./utils/seedData.js";
import { ensureAdminFromEnv } from "./utils/ensureAdmin.js";
import User from "./models/User.js";
import Settings from "./models/Settings.js";
import TestSeries from "./models/TestSeries.js";

const PORT = process.env.PORT || 5000;

// Permanently remove temporary accounts once their expiry time has passed.
// Runs on boot and then on a fixed interval so expired users disappear on
// their own without any manual admin action.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
async function cleanupExpiredUsers() {
  try {
    const { deletedCount } = await User.deleteMany({
      expiresAt: { $ne: null, $lt: new Date() },
    });
    if (deletedCount) console.log(`🧹 Removed ${deletedCount} expired temporary account(s).`);
  } catch (err) {
    console.error("Expired-user cleanup skipped:", err.message);
  }
}

// One-time migration: make every EXISTING test series private so students only
// see tests they've been granted (matching the new default for new tests).
// Runs once — a flag in Settings prevents it from repeating, so an admin can
// still make specific tests public afterwards.
async function privatizeExistingTests() {
  try {
    const settings = await Settings.findOneAndUpdate(
      { key: "site" },
      {},
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (settings.testsPrivatized) return;
    const { modifiedCount } = await TestSeries.updateMany(
      { visibleToAll: { $ne: false } },
      { $set: { visibleToAll: false } }
    );
    settings.testsPrivatized = true;
    await settings.save();
    console.log(`🔒 Made ${modifiedCount} existing test series private (one-time migration).`);
  } catch (err) {
    console.error("Test-privacy migration skipped:", err.message);
  }
}

async function start() {
  await connectDB();

  // Start listening immediately so the host detects an open port quickly.
  app.listen(PORT, () => {
    console.log(`✔ My Prep Mart API running on http://localhost:${PORT}`);
  });

  // Auto-delete expired temporary accounts.
  cleanupExpiredUsers();
  setInterval(cleanupExpiredUsers, CLEANUP_INTERVAL_MS);

  // Make existing test series private (one-time).
  privatizeExistingTests();

  // Seed in the background (never blocks startup, never crashes the server).
  // Runs only when the database has no users — handy on hosts without shell
  // access (e.g. Render free tier). Disable with AUTO_SEED=off.
  if (process.env.AUTO_SEED !== "off") {
    seedIfEmpty()
      .then((seeded) => {
        if (seeded) console.log("✔ Database was empty — seeded sample data (admin@myprepmart.com / admin123).");
      })
      .catch((err) => console.error("Auto-seed skipped:", err.message))
      // After seeding, ensure the env-configured admin exists (create/recover).
      .finally(() => ensureAdminFromEnv().catch((e) => console.error("ensureAdmin skipped:", e.message)));
  } else {
    ensureAdminFromEnv().catch((e) => console.error("ensureAdmin skipped:", e.message));
  }
}

start();
