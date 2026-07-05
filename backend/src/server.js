import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { seedIfEmpty } from "./utils/seedData.js";
import { ensureAdminFromEnv } from "./utils/ensureAdmin.js";

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();

  // Start listening immediately so the host detects an open port quickly.
  app.listen(PORT, () => {
    console.log(`✔ My Prep Mart API running on http://localhost:${PORT}`);
  });

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
