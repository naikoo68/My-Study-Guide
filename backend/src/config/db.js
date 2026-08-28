// Connects to whichever database DB_ENGINE selects.
//   DB_ENGINE=dynamo -> ensure DynamoDB tables exist (no persistent connection)
//   DB_ENGINE=mongo  -> connect to MongoDB via Mongoose (default)
export default async function connectDB() {
  const engine = (process.env.DB_ENGINE || "mongo").toLowerCase();

  if (engine === "dynamo") {
    try {
      const { ensureTables } = await import("../db/createTables.js");
      const { REGION, ENDPOINT, isLocal } = await import("./dynamo.js");
      await ensureTables();
      console.log(`✔ DynamoDB ready (region: ${REGION}${isLocal() ? `, endpoint: ${ENDPOINT}` : ""}).`);
    } catch (err) {
      console.error(`✖ DynamoDB initialisation error: ${err.message}`);
      if (err.name === "UnrecognizedClientException" || err.name === "CredentialsProviderError") {
        console.error("  Check your AWS credentials / region, or set DYNAMODB_ENDPOINT for DynamoDB Local.");
      }
      process.exit(1);
    }
    return;
  }

  // Default: MongoDB
  const mongoose = (await import("mongoose")).default;
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("✖ MONGO_URI is not set. Check your .env file (or set DB_ENGINE=dynamo).");
    process.exit(1);
  }
  try {
    const conn = await mongoose.connect(uri);
    console.log(`✔ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`✖ MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
}
