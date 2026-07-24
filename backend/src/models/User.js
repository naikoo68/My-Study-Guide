import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, minlength: 6, select: false },
    googleId: { type: String },
    avatar: { type: String },
    // "client" = a self-service account that can ONLY use the My Practice
    // section, where it builds & practices its own private content.
    role: { type: String, enum: ["student", "admin", "client"], default: "student" },
    plan: { type: String, enum: ["Free", "Premium", "Pro"], default: "Free" },
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    isEmailVerified: { type: Boolean, default: false },
    // Temporary accounts (created by an admin) expire at this time. When null
    // the account never expires. After expiry the user can no longer log in.
    expiresAt: { type: Date, default: null },
    // Content access. Quizzes are available to everyone by default; an admin
    // can revoke quiz access for a specific user. Test-series access is stored
    // per test on the TestSeries model.
    quizAccess: { type: Boolean, default: true },
  // Practice-content access grants. OFF by default: a user only sees the
  // My-Quiz / My-Test items explicitly shared with them (per-item visibility).
  // Turning these ON grants the user access to ALL My Quiz / My Test content
  // (an additive master grant — it never removes per-item access).
  myQuizAccess: { type: Boolean, default: false },
  myTestAccess: { type: Boolean, default: false },
    // AI access for client accounts. aiAccess is the master switch. New clients
    // and active subscribers get it turned ON automatically (every plan carries
    // AI limits); an admin can still turn it OFF for a specific client. The
    // schema default stays false so admin/student docs (which never set it)
    // don't imply AI access — client access is granted explicitly on register,
    // on subscription activation, and via a one-time backfill for existing ones.
    // The two pools the client may draw from:
    //   • inbuilt — the platform's built-in (admin) API keys
    //   • self    — API keys the client adds themselves
    // aiMode is the client's own choice between the pools they're allowed to use.
    aiAccess: { type: Boolean, default: false },
    aiAllowInbuilt: { type: Boolean, default: true },
    aiAllowSelf: { type: Boolean, default: true },
    aiMode: { type: String, enum: ["inbuilt", "self"], default: "inbuilt" },
    // Per-feature access for the client workspace tabs. Dashboard/Build/Notes/
    // Documents/User-manual are ON by default; the AI Generator is OFF by default
    // (the AI keys tab is gated by aiAccess above, also OFF by default).
    featDashboard: { type: Boolean, default: true },
    featBuild: { type: Boolean, default: true },
    featNotes: { type: Boolean, default: true },
    featDocuments: { type: Boolean, default: true },
    featManual: { type: Boolean, default: true },
    featAiGenerator: { type: Boolean, default: false },
    emailVerificationToken: String,
    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    enrolledTests: [{ type: mongoose.Schema.Types.ObjectId, ref: "TestSeries" }],
    // Client subscription (chosen at self-service Client registration). The
    // account's validity (expiresAt) is set from subscriptionMonths on verify.
    subscriptionPlan: { type: String },    // "1m" | "2m" | "6m" | "1y"
    subscriptionMonths: { type: Number },
    subscriptionPrice: { type: Number },   // final price after coupon/referral
    // Referrals: this user's OWN shareable code + the code they signed up with.
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: String },
    referrerRewarded: { type: Boolean, default: false }, // referrer already credited for this user's first paid plan
    couponCode: { type: String },
    isTrial: { type: Boolean, default: false }, // on a free trial (vs a paid plan)
    paymentId: { type: String }, // Razorpay payment id (paid client signups)
    streak: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Hash password before saving.
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);
