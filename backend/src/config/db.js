// Connects to whichever database DB_ENGINE selects.
//   DB_ENGINE=dynamo -> ensure DynamoDB tables exist (no persistent connection)
//   DB_ENGINE=mongo  -> connect to MongoDB via Mongoose (default)
//   DB_ENGINE=oracle -> connect to Oracle Autonomous Database via its MongoDB
//                       API (also Mongoose — just a different URI + options)
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

  // Oracle Autonomous Database via its MongoDB-compatible API. The app speaks
  // Mongoose exactly like DB_ENGINE=mongo — only the connection differs:
  //   • Use the exact URI Oracle generates for the MongoDB API (it already
  //     carries TLS, auth and retryWrites=false). Set it as ORACLE_MONGO_URI
  //     (falls back to MONGO_URI if you reuse the same var).
  //   • Keep the pool SMALL: Always Free Oracle caps simultaneous sessions
  //     (~30), so a large Mongoose pool would exhaust them. Tune ORACLE_MAX_POOL.
  if (engine === "oracle") {
    const mongoose = (await import("mongoose")).default;
    const uri = process.env.ORACLE_MONGO_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error("✖ ORACLE_MONGO_URI (or MONGO_URI) is not set for DB_ENGINE=oracle.");
      process.exit(1);
    }
    const maxPoolSize = Number(process.env.ORACLE_MAX_POOL) || 20;
    try {
      const conn = await mongoose.connect(uri, { maxPoolSize });
      console.log(`✔ Oracle Autonomous Database (MongoDB API) connected: ${conn.connection.host} (pool ${maxPoolSize}).`);
    } catch (err) {
      console.error(`✖ Oracle Autonomous connection error: ${err.message}`);
      console.error("  Check ORACLE_MONGO_URI, that the MongoDB API is enabled on the database, and that this server's outbound IP is allowlisted in the Oracle ACL.");
      process.exit(1);
    }
    return;
  }

  // Default: MongoDB
  const mongoose = (await import("mongoose")).default;
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("✖ MONGO_URI is not set. Check your .env file (or set DB_ENGINE=dynamo/oracle).");
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
