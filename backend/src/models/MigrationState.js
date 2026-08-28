import mongoose from "../db/odm.js";

// Tracks the resumable MongoDB->DynamoDB import so it can survive restarts and
// resume from a checkpoint instead of starting over. One record (_id =
// "mongo-import"). Stored as a plain flexible document.
const migrationStateSchema = new mongoose.Schema(
  {
    phase: { type: String, default: "" }, // "" | clearing | importing | done
    plan: { type: mongoose.Schema.Types.Mixed, default: undefined },
    progress: { type: mongoose.Schema.Types.Mixed, default: undefined },
    startedAt: { type: String },
    finishedAt: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("MigrationState", migrationStateSchema);
