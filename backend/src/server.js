import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { seedIfEmpty } from "./utils/seedData.js";

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();

  // On hosts without shell access (e.g. Render free tier), populate the
  // database automatically the first time it's empty. Set AUTO_SEED=off to skip.
  if (process.env.AUTO_SEED !== "off") {
    try {
      const seeded = await seedIfEmpty();
      if (seeded) console.log("✔ Database was empty — seeded sample data (admin@myprepmart.com / admin123).");
    } catch (err) {
      console.error("Auto-seed skipped:", err.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`✔ My Prep Mart API running on http://localhost:${PORT}`);
  });
}

start();
