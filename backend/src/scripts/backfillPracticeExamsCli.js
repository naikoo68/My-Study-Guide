import "dotenv/config";
// Register the global tenantId plugin BEFORE any model compiles.
import "../config/registerModelPlugins.js";
import mongoose from "../db/odm.js";
import connectDB from "../config/db.js";
import { backfillPracticeExams } from "../utils/backfillPracticeExams.js";

// Manual runner for the My-Quiz "Exam" level backfill. This is OPTIONAL — the
// same backfill runs automatically once on server startup (see server.js). Kept
// for running it on demand (e.g. after a bulk import/restore).
//
// Run with:  node src/scripts/backfillPracticeExamsCli.js   (from backend/)

async function run() {
  await connectDB();
  const r = await backfillPracticeExams({ log: (m) => console.log(m) });
  console.log(`\n✔ Done. Created ${r.examsCreated} exam(s), moved ${r.subjectsMoved} subject(s), tagged ${r.itemsUpdated} quiz item(s).`);
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Practice-exam backfill FAILED:", err);
  process.exit(1);
});
