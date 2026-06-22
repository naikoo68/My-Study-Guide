import mongoose from "mongoose";

export default async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("✖ MONGO_URI is not set. Check your .env file.");
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
