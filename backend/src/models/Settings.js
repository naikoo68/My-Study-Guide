import mongoose from "mongoose";

const socialSchema = new mongoose.Schema(
  { platform: { type: String, default: "website" }, url: { type: String, default: "" } },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  { type: { type: String, default: "email" }, value: { type: String, default: "" } },
  { _id: false }
);

// Singleton site-wide settings the admin can customise.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "site", unique: true },
    // One-time migration flag: existing test series were made private-by-default.
    testsPrivatized: { type: Boolean, default: false },
    siteName: { type: String, default: "My Study Guide" },
    tagline: { type: String, default: "Prepare Smart, Achieve More." },
    logoUrl: { type: String, default: "" }, // image URL or base64 data URI
    primaryColor: { type: String, default: "#2563eb" },
    accentColor: { type: String, default: "#f97316" },
    fontFamily: { type: String, default: "Inter" },
    socialLinks: {
      type: [socialSchema],
      default: () => [
        { platform: "facebook", url: "#" },
        { platform: "twitter", url: "#" },
        { platform: "instagram", url: "#" },
        { platform: "linkedin", url: "#" },
        { platform: "youtube", url: "#" },
      ],
    },
    contacts: {
      type: [contactSchema],
      default: () => [
        { type: "email", value: "hello@mystudyguide.com" },
        { type: "phone", value: "+91 98765 43210" },
        { type: "address", value: "Knowledge Park, New Delhi, India" },
      ],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", settingsSchema);
