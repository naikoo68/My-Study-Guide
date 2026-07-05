import mongoose from "mongoose";

const socialSchema = new mongoose.Schema(
  { platform: { type: String, default: "website" }, url: { type: String, default: "" } },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  { type: { type: String, default: "email" }, value: { type: String, default: "" } },
  { _id: false }
);

const aboutValueSchema = new mongoose.Schema(
  { title: { type: String, default: "" }, desc: { type: String, default: "" } },
  { _id: false }
);

const aboutStatSchema = new mongoose.Schema(
  { value: { type: String, default: "" }, label: { type: String, default: "" } },
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
        { platform: "facebook", url: "" },
        { platform: "instagram", url: "" },
        { platform: "whatsapp", url: "" },
        { platform: "youtube", url: "" },
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
    // Editable "About Us" page content
    aboutHeading: { type: String, default: "Built by educators, loved by toppers" },
    aboutIntro: {
      type: String,
      default:
        "My Study Guide started with one belief — that smart, structured practice beats endless cramming. We combine curated question banks with real-time analytics to help you study exactly what matters.",
    },
    aboutValues: {
      type: [aboutValueSchema],
      default: () => [
        { title: "Our Mission", desc: "Make high-quality exam preparation accessible and affordable for every student." },
        { title: "Our Vision", desc: "Become the most trusted self-study companion powered by data-driven learning." },
        { title: "Our Promise", desc: "Honest content, transparent analytics and relentless focus on student outcomes." },
      ],
    },
    aboutStats: {
      type: [aboutStatSchema],
      default: () => [
        { value: "1,20,000+", label: "Students" },
        { value: "8,500+", label: "Quizzes" },
        { value: "640+", label: "Test Series" },
      ],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", settingsSchema);
