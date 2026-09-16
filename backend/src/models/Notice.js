import mongoose from "../db/odm.js";

// A short announcement/notice shown in the scrolling ticker at the top of the
// site. Admins add, edit, delete and toggle these. Only `active` notices are
// shown to students.
const noticeSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    link: { type: String, default: "" }, // optional URL the notice links to
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 }, // lower shows first
    // Auto-generated "New <Quiz/Test> added" notices (from notify.js) vs a
    // manual announcement typed by an admin. Only auto notices get an expiry.
    auto: { type: Boolean, default: false },
    // When set, the notice is hidden from students after this time. Applied ONLY
    // to auto/content notices (based on the notifyExpiryDays setting); manual
    // notices leave this null and never expire.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Notice", noticeSchema);
