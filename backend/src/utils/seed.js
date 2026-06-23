// CLI seed script — wipes and repopulates the DB. Run with: npm run seed
import "dotenv/config";
import connectDB from "../config/db.js";
import { seedDatabase } from "./seedData.js";

(async () => {
  try {
    await connectDB();
    const info = await seedDatabase({ reset: true });
    console.log("✔ Seed complete.");
    console.log(`  Admin:   ${info.admin}`);
    console.log(`  Student: ${info.student}`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
