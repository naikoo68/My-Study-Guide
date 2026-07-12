import mongoose from "mongoose";

// An AI provider API key managed from the admin panel. Each key has its own
// base URL and model list (OpenAI-compatible). The AI generator uses all
// ENABLED keys — several keys with the same model act as quota fallbacks.
const aiKeySchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "" }, // friendly name, e.g. "Gemini account 1"
    baseUrl: { type: String, trim: true, default: "https://generativelanguage.googleapis.com/v1beta/openai" },
    models: { type: String, trim: true, default: "gemini-flash-latest" }, // comma-separated model ids
    key: { type: String, trim: true, required: true }, // the secret API key
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // Result of the last "Test" — so the admin can see active/inactive.
    lastStatus: { type: String, enum: ["", "ok", "error"], default: "" },
    lastError: { type: String, default: "" },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("AiKey", aiKeySchema);
