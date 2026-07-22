import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { seedIfEmpty } from "./utils/seedData.js";
import { ensureAdminFromEnv } from "./utils/ensureAdmin.js";
import { ensureDefaultStream } from "./utils/ensureDefaultStream.js";
import { runDueFbSchedules } from "./config/facebook.js";
import Settings from "./models/Settings.js";
import TestSeries from "./models/TestSeries.js";
import User from "./models/User.js";

const PORT = process.env.PORT || 5000;

// NOTE: Expired accounts are NEVER deleted. When a client's subscription/trial
// ends we only RESTRICT access (the `protect` middleware blocks their content
// and the frontend shows an Upgrade screen) — their account and the quizzes/
// tests they built are preserved so everything returns the moment they renew.

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

// One-time migration: grant AI access to every EXISTING client account. AI was
// gated behind a master switch that defaulted OFF and was never turned on by
// registration/subscription, so clients couldn't generate questions. Every
// plan already carries AI limits, so all active clients should have access.
// Runs once (a flag in Settings prevents repeats), so an admin can still turn
// AI off for a specific client afterwards without it flipping back on.
async function enableClientAiAccess() {
  try {
    const settings = await Settings.findOneAndUpdate(
      { key: "site" },
      {},
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (settings.aiClientAccessBackfilled) return;
    const { modifiedCount } = await User.updateMany(
      { role: "client", aiAccess: { $ne: true } },
      { $set: { aiAccess: true } }
    );
    settings.aiClientAccessBackfilled = true;
    await settings.save();
    console.log(`🤖 Granted AI access to ${modifiedCount} existing client account(s) (one-time migration).`);
  } catch (err) {
    console.error("Client AI-access migration skipped:", err.message);
  }
}

async function start() {
  await connectDB();

  // Start listening immediately so the host detects an open port quickly.
  app.listen(PORT, () => {
    console.log(`✔ My Study Guide API running on http://localhost:${PORT}`);
  });

  // Make existing test series private (one-time).
  privatizeExistingTests();

  // Grant AI access to existing client accounts (one-time).
  enableClientAiAccess();

  // Facebook scheduled auto-posting: check every minute for due schedules.
  // (The /api/health ping also triggers this as a safety net after downtime.)
  setInterval(() => { runDueFbSchedules().catch(() => {}); }, 60 * 1000);

  // Ensure a default "JKSSB" stream exists and move any stream-less subjects in.
  ensureDefaultStream();

  // Seed in the background (never blocks startup, never crashes the server).
  // Runs only when the database has no users — handy on hosts without shell
  // access (e.g. Render free tier). Disable with AUTO_SEED=off.
  if (process.env.AUTO_SEED !== "off") {
    seedIfEmpty()
      .then((seeded) => {
        if (seeded) console.log("✔ Database was empty — seeded sample data (admin@mystudyguide.com / admin123).");
      })
      .catch((err) => console.error("Auto-seed skipped:", err.message))
      // After seeding, ensure the env-configured admin exists (create/recover)
      // and that seeded subjects are placed inside the default stream.
      .finally(() => {
        ensureAdminFromEnv().catch((e) => console.error("ensureAdmin skipped:", e.message));
        ensureDefaultStream();
      });
  } else {
    ensureAdminFromEnv().catch((e) => console.error("ensureAdmin skipped:", e.message));
  }
}

start();
