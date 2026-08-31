import crypto from "crypto";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import { isDev } from "../utils/env.js";
import TrialClaim from "../models/TrialClaim.js";
import { trialClaimed, recordTrialUsed } from "../utils/trialLedger.js";
import EmailOtp from "../models/EmailOtp.js";
import Coupon, { redeemCoupon } from "../models/Coupon.js";
import generateToken from "../utils/generateToken.js";
import { razorpayConfigured, verifyPaymentSignature, verifyPaidOrder } from "../config/razorpay.js";
import { sendMail } from "../config/mailer.js";
import { clientBaseFromReq } from "../config/clientUrl.js";
import { notifyNewUser } from "../utils/notify.js";
import { getClientPlans, getPlansFor, getStudentPlans as loadStudentPlans, trialDays } from "../utils/plans.js";
import { runUnscoped } from "../utils/tenantContext.js";
import { planFlagsSync } from "../utils/siteFlags.js";
import { getSiteName } from "../utils/siteInfo.js";
import { tenantSuspended, SUSPENDED_INSTITUTE_MESSAGE } from "../middleware/auth.js";

// Normalise emails so case/whitespace never causes a login mismatch
// (phone keyboards often auto-capitalise the first letter).
const norm = (e) => String(e || "").toLowerCase().trim();

// ---- OTP helpers ----
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function issueOtp(user) {
  const otp = genOtp();
  user.otpHash = hashOtp(otp);
  user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
  user.otpAttempts = 0; // fresh code → reset the wrong-guess counter
  await user.save();
  return otp;
}

async function sendOtpEmail(email, name, otp) {
  const site = await getSiteName();
  return sendMail({
    to: email,
    fromName: site,
    subject: `Your ${site} verification code`,
    text: `Hi ${name || "there"},\n\nYour verification code is ${otp}. It expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
    html: `<p>Hi ${name || "there"},</p>
           <p>Your verification code is:</p>
           <p style="font-size:28px;font-weight:800;letter-spacing:6px">${otp}</p>
           <p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
  });
}

const sanitize = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone || "",
  role: u.role,
  plan: u.plan,
  avatar: u.avatar,
  isEmailVerified: u.isEmailVerified,
  mustChangePassword: u.mustChangePassword === true, // frontend forces a password change when true (bootstrap password)
  expiresAt: u.expiresAt,
  quizAccess: u.quizAccess !== false,
  streak: u.streak,
  referralCode: u.referralCode,
  subscriptionPlan: u.subscriptionPlan,
  isTrial: u.isTrial,
  // Student subscription state — drives the student paywall / gated features.
  studentPlan: u.studentPlan,
  studentPlanExpiresAt: u.studentPlanExpiresAt,
  studentTrial: u.studentTrial === true,
  studentTrialUsed: u.studentTrialUsed === true,
  // True when the student has a live plan OR the student paywall is disabled
  // site-wide (studentPlansEnabled=false → everything is free for students).
  studentSubscribed:
    (u.role === "student" && planFlagsSync(u.tenantId).studentPlansEnabled === false) ||
    !!(u.studentPlanExpiresAt && new Date(u.studentPlanExpiresAt).getTime() > Date.now()),
  // AI access (client accounts) — drives the client workspace's AI tab.
  aiAccess: u.aiAccess === true,
  aiAllowInbuilt: u.aiAllowInbuilt !== false,
  aiAllowSelf: u.aiAllowSelf !== false,
  aiMode: u.aiMode === "self" ? "self" : "inbuilt",
  // Practice-content master grants.
  myQuizAccess: u.myQuizAccess === true,
  myTestAccess: u.myTestAccess === true,
  // Per-feature client workspace access (Dashboard/Build/Notes/Documents/
  // User-manual default ON; AI Generator default OFF).
  featDashboard: u.featDashboard !== false,
  featBuild: u.featBuild !== false,
  featPapers: u.featPapers !== false,
  featChecker: u.featChecker !== false,
  featNotes: u.featNotes !== false,
  featDocuments: u.featDocuments !== false,
  featManual: u.featManual !== false,
  featAiGenerator: u.featAiGenerator === true,
  // First-run creator setup guide progress — drives CreatorSetupGuide.
  creatorGuide: {
    regenerated: u.creatorGuide?.regenerated === true,
    extended: u.creatorGuide?.extended === true,
    completed: u.creatorGuide?.completed === true,
  },
});

// Look up the institute (tenant) a user belongs to, exposing just the public
// slug + display name. The frontend uses this so an institute admin's
// "student portal" link can target their OWN institute via ?t=<slug>. The
// Tenant model is exempt from tenant scoping, so a plain query is safe here.
async function tenantInfo(tenantId) {
  if (!tenantId) return undefined;
  try {
    const t = await Tenant.findById(tenantId).select("slug name features").lean();
    return t ? { slug: t.slug, name: t.name, features: t.features || {} } : undefined;
  } catch {
    return undefined;
  }
}

// Client subscription plans now live in Settings (admin-editable, with AI
// limits). See utils/plans.js — getClientPlans() returns them (or defaults).

// Promo coupons. type "percent" → value = % off; type "flat" → value = ₹ off.
// Add or edit codes here to run promotions.
const COUPONS = {
  WELCOME10: { type: "percent", value: 10, label: "10% off" },
  SAVE100: { type: "flat", value: 100, label: "₹100 off" },
  FRIEND50: { type: "flat", value: 50, label: "₹50 off" },
};

// Flat discount (₹) for signing up with a valid friend's referral code.
const REFERRAL_DISCOUNT = 50;
// Days added to a REFERRER's account when a friend they referred buys a paid
// plan (credited once per referred friend).
const REFERRAL_BONUS_DAYS = 10;



// A short, human-ish unique referral/share code, e.g. "RAHU3F9A".
function makeReferralCode(name) {
  const base = String(name || "").replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase() || "USER";
  return `${base}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

// Compute the payable price for a plan, applying an optional coupon and/or a
// valid friend's referral code. Returns null if the plan key is invalid.
// `audience` selects the plan catalog: "student" → student plans, else client.
export async function computeOffer({ planKey, couponCode, referralCode, selfEmail, audience }) {
  const plans = await getPlansFor(audience);
  const plan = plans.find((p) => p.key === planKey) || null;
  if (!plan) return null;
  const base = plan.price;
  let discount = 0;
  const applied = { coupon: null, referral: null };

  const code = String(couponCode || "").trim().toUpperCase();
  if (code) {
    // Admin-managed coupons (DB) take priority; fall back to the built-in codes.
    const dbCoupon = await Coupon.findOne({ code });
    let c = null;
    if (dbCoupon) {
      const usable = dbCoupon.active && (!dbCoupon.usageLimit || dbCoupon.usedCount < dbCoupon.usageLimit);
      if (usable) c = { type: dbCoupon.type, value: dbCoupon.value, label: dbCoupon.type === "percent" ? `${dbCoupon.value}% off` : `₹${dbCoupon.value} off` };
    } else if (COUPONS[code]) {
      c = COUPONS[code];
    }
    if (c) {
      const d = c.type === "percent" ? Math.round((base * c.value) / 100) : c.value;
      discount += d;
      applied.coupon = { code, label: c.label, discount: d };
    } else {
      applied.coupon = { code, invalid: true };
    }
  }

  const ref = String(referralCode || "").trim().toUpperCase();
  if (ref) {
    const refUser = await runUnscoped(() => User.findOne({ referralCode: ref }).select("email"));
    if (refUser && norm(refUser.email) !== norm(selfEmail || "")) {
      discount += REFERRAL_DISCOUNT;
      applied.referral = { code: ref, discount: REFERRAL_DISCOUNT };
    } else {
      applied.referral = { code: ref, invalid: true };
    }
  }

  // A PAID plan must always keep at least ₹1 payable — stacked coupon + referral
  // (or a large coupon) can NEVER discount it to ₹0. Otherwise the "free" path
  // would activate the plan and extend validity with no payment taken. Only the
  // ₹0 trial plan is genuinely free.
  if (base > 0 && discount > base - 1) discount = base - 1;
  const finalPrice = Math.max(0, base - discount);
  return { plan: { key: plan.key, label: plan.label, months: plan.months }, basePrice: base, discount, finalPrice, applied };
}

// When `referredUser` buys their FIRST paid plan, credit the friend who referred
// them (matched by referral code) with REFERRAL_BONUS_DAYS extra days. Credited
// once per referred user. Sets `referrerRewarded` on the passed doc — the CALLER
// is responsible for saving `referredUser`.
export async function creditReferrer(referredUser) {
  if (!referredUser?.referredBy || referredUser.referrerRewarded) return;
  referredUser.referrerRewarded = true; // mark handled regardless of outcome (caller persists)

  const referrer = await runUnscoped(() => User.findOne({ referralCode: referredUser.referredBy }));
  // Only client accounts have a validity to extend; skip self-referrals.
  if (!referrer || referrer.role !== "client" || String(referrer._id) === String(referredUser._id)) return;

  const now = Date.now();
  const base = referrer.expiresAt && referrer.expiresAt.getTime() > now ? new Date(referrer.expiresAt) : new Date();
  base.setDate(base.getDate() + REFERRAL_BONUS_DAYS);
  referrer.expiresAt = base;
  referrer.isTrial = false; // a rewarded referrer is no longer just on a trial
  await referrer.save();
}

// Start the subscription/trial clock on a user (or a not-yet-created account
// doc) once its email is confirmed. Shared by verifyOtp (post-signup OTP) and
// register (pre-verified email). Idempotent — never overwrites an existing
// expiry, and safely no-ops when no plan is set (e.g. plans turned off).
async function applyActivationClock(u) {
  if (u.role === "client" && u.subscriptionPlan && !u.expiresAt) {
    const exp = new Date();
    if (u.subscriptionPlan === "trial") {
      const trialPlan = (await getClientPlans()).find((p) => p.key === "trial");
      exp.setDate(exp.getDate() + trialDays(trialPlan, 1));
    } else {
      exp.setMonth(exp.getMonth() + (u.subscriptionMonths || 0));
    }
    u.expiresAt = exp;
  }
  if (u.role === "student" && u.studentPlan && !u.studentPlanExpiresAt) {
    const exp = new Date();
    if (u.studentPlan === "trial") {
      const trialPlan = (await loadStudentPlans()).find((p) => p.key === "trial");
      exp.setDate(exp.getDate() + trialDays(trialPlan, 1));
    } else {
      exp.setMonth(exp.getMonth() + (u.studentPlanMonths || 0));
      u.studentTrial = false;
    }
    u.studentPlanExpiresAt = exp;
  }
}

// ---- Pre-account email verification (student / creator inline "Verify") ----
// Same mechanism as institute signup: a short-lived code keyed by EMAIL (no
// user exists yet), stored in the standalone EmailOtp collection. Lets students
// and creators confirm their email BEFORE the account is created — matching the
// institute UX — so the account can be created already-verified.
async function emailPreVerified(email) {
  if (!email) return false;
  return !!(await runUnscoped(() => EmailOtp.findOne({ email, verified: true }).select("_id")));
}
function consumeEmailOtp(email) {
  return runUnscoped(() => EmailOtp.deleteOne({ email })).catch(() => {});
}

// POST /api/auth/send-email-otp { email } — email a fresh 6-digit code.
export async function sendEmailOtp(req, res) {
  const email = norm(req.body?.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }
  // Don't let someone verify an email that's already tied to an account.
  const taken = await runUnscoped(() => User.findOne({ email }).select("_id"));
  if (taken) return res.status(409).json({ message: "That email is already registered. Please log in instead." });

  const otp = genOtp();
  await runUnscoped(() =>
    EmailOtp.findOneAndUpdate(
      { email },
      { email, otpHash: hashOtp(otp), otpExpires: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0, verified: false, verifiedAt: null },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  );

  const emailSent = await sendOtpEmail(email, "", otp).catch(() => false);
  const exposeDevOtp = !emailSent && isDev(); // expose devOtp only in explicit development (secure default)
  res.json({ emailSent, ...(exposeDevOtp ? { devOtp: otp } : {}) });
}

// POST /api/auth/verify-email-otp { email, otp } — confirm the code.
export async function verifyEmailOtp(req, res) {
  const email = norm(req.body?.email);
  const otp = String(req.body?.otp || "").trim();
  const rec = await runUnscoped(() => EmailOtp.findOne({ email }));
  if (!rec || !rec.otpHash || !rec.otpExpires || rec.otpExpires.getTime() < Date.now()) {
    return res.status(400).json({ message: "Your code has expired. Please request a new one." });
  }
  if (hashOtp(otp) !== rec.otpHash) {
    // Cap wrong guesses so the 6-digit email code can't be brute-forced.
    rec.otpAttempts = (rec.otpAttempts || 0) + 1;
    if (rec.otpAttempts >= 5) { rec.otpHash = undefined; rec.otpExpires = undefined; await runUnscoped(() => rec.save()); return res.status(429).json({ message: "Too many incorrect codes. Please request a new one." }); }
    await runUnscoped(() => rec.save());
    return res.status(400).json({ message: "Incorrect code. Please try again." });
  }
  rec.verified = true;
  rec.verifiedAt = new Date();
  rec.otpHash = undefined;
  rec.otpExpires = undefined;
  await runUnscoped(() => rec.save());
  res.json({ verified: true });
}

// POST /api/auth/register
export async function register(req, res) {
  const { name, password } = req.body;
  const email = norm(req.body.email);
  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const exists = await runUnscoped(() => User.findOne({ email }));
  if (exists) return res.status(409).json({ message: "Email already registered" });

  // A client account (self-service) only accesses the My Practice section.
  // Only "client" can be self-selected here; "admin" can never be self-assigned.
  const role = req.body.role === "client" ? "client" : "student";

  // Every account gets its own shareable referral code. Client accounts get AI
  // access on by default — every subscription plan (trial included) carries its
  // own AI generation limits, so a client can use the generator right away. An
  // admin can still turn it off per-account later (User → aiAccess).
  const doc = { name, email, password, role, isEmailVerified: false, referralCode: makeReferralCode(name) };
  // Creators get AI access AND the AI Generator on by default — the first-run
  // setup guide adds the first question via the AI Generator page, so both must
  // be available out of the box. An admin can still turn either off per-account.
  if (role === "client") { doc.aiAccess = true; doc.featAiGenerator = true; }

  // If this email already consumed a student free trial before (durable ledger),
  // carry that forward so a re-registered account can't claim the trial again —
  // and the trial option stays hidden for them in the UI.
  if (role === "student") {
    const claimed = await runUnscoped(() => TrialClaim.findOne({ email, kind: "student" }).select("_id"));
    if (claimed) doc.studentTrialUsed = true;
  }

  // When the CREATOR plans toggle is OFF, creators use everything free and their
  // accounts never expire (see creatorPlansDisabled in middleware/auth.js). In
  // that state a new creator must NOT be asked to pick/pay for a plan — we skip
  // the whole plan/offer/payment step and just create a free account.
  const creatorPlansOff = role === "client" && planFlagsSync().creatorPlansEnabled === false;

  // Clients pick a subscription plan and may use a coupon / friend's referral
  // code. Store the selection; validity (expiresAt) starts when they verify.
  let paidActive = false;
  if (role === "client" && !creatorPlansOff) {
    // Default to the free 1-day trial when no (valid) plan is chosen.
    const offer =
      (await computeOffer({ planKey: req.body.plan, couponCode: req.body.couponCode, referralCode: req.body.referralCode, selfEmail: email })) ||
      (await computeOffer({ planKey: "trial", selfEmail: email }));
    if (offer) {
      // One free trial per email (durable) — block re-claiming via a new account.
      if (offer.plan.key === "trial" && (await trialClaimed(email, "client"))) {
        return res.status(400).json({ message: "This email has already used the free trial. Please choose a paid plan." });
      }
      doc.subscriptionPlan = offer.plan.key;
      doc.subscriptionMonths = offer.plan.months;
      doc.subscriptionPrice = offer.finalPrice;
      doc.isTrial = offer.plan.key === "trial";
      if (offer.applied?.coupon && !offer.applied.coupon.invalid) doc.couponCode = offer.applied.coupon.code;
      if (offer.applied?.referral && !offer.applied.referral.invalid) doc.referredBy = offer.applied.referral.code;

      // If online payments are enabled and the plan costs money, a verified
      // Razorpay payment is REQUIRED. On success the account is activated at
      // once (validity starts now) and the user is signed straight in — no OTP.
      if (razorpayConfigured() && offer.finalPrice > 0) {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        // No payment fields → the page registered without going through Checkout
        // (often an older cached frontend build, or payment was dismissed).
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
          return res.status(400).json({ message: "No payment was received. Please refresh the page (hard-reload) and try again." });
        }
        const ok = verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });
        if (!ok) {
          console.error("[payment] signature verification failed", { order: razorpay_order_id, payment: razorpay_payment_id });
          return res.status(400).json({
            message:
              "Payment signature check failed. This almost always means RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server are not from the SAME key pair (or aren't both Live). Please re-check them on Render.",
          });
        }
        // The signature only proves the payment is authentic for ITS order — not
        // that the order was for THIS plan/amount. Re-fetch the order and confirm
        // it was paid in full for the exact plan+price we're about to grant, so a
        // cheap order can't be used to claim an expensive plan.
        const match = await verifyPaidOrder({
          orderId: razorpay_order_id,
          expectedAmountRupees: offer.finalPrice,
          expectedPlan: offer.plan.key,
          expectedEmail: email,
        });
        if (!match.ok) {
          console.error("[payment] order verification failed", { order: razorpay_order_id, reason: match.reason });
          return res.status(400).json({ message: "Payment could not be verified. Please try again." });
        }
        // Replay protection: a payment id may only ever activate ONE account.
        const usedPayment = await runUnscoped(() => User.findOne({ paymentId: razorpay_payment_id }).select("_id"));
        if (usedPayment) {
          return res.status(400).json({ message: "This payment has already been used to create an account." });
        }
        doc.isEmailVerified = true;
        doc.paymentId = razorpay_payment_id;
        const exp = new Date();
        exp.setMonth(exp.getMonth() + offer.plan.months);
        doc.expiresAt = exp;
        paidActive = true;
      }
    }
  }

  // Students may also pick a plan at sign-up (mirrors the client flow, but writes
  // the SEPARATE student* fields so it never touches client/temp-account expiry).
  // When the STUDENT plans toggle is OFF, students use everything free — skip the
  // plan/payment step and just create a free account.
  const studentPlansOff = role === "student" && planFlagsSync().studentPlansEnabled === false;
  if (role === "student" && !studentPlansOff) {
    const offer =
      (await computeOffer({ planKey: req.body.plan, couponCode: req.body.couponCode, referralCode: req.body.referralCode, selfEmail: email, audience: "student" })) ||
      (await computeOffer({ planKey: "trial", selfEmail: email, audience: "student" }));
    if (offer) {
      if (offer.plan.key === "trial") {
        // One free student trial per email (durable) — block re-claiming.
        if (await trialClaimed(email, "student")) {
          return res.status(400).json({ message: "This email has already used the free trial. Please choose a paid plan." });
        }
        doc.studentPlan = "trial";
        doc.studentTrial = true;
        doc.studentTrialUsed = true;
        doc.studentPlanMonths = 0;
        doc.studentPlanPrice = 0;
        // Validity (studentPlanExpiresAt) starts when they verify the OTP.
      } else {
        doc.studentPlan = offer.plan.key;
        doc.studentPlanMonths = offer.plan.months;
        doc.studentPlanPrice = offer.finalPrice;
        if (offer.applied?.coupon && !offer.applied.coupon.invalid) doc.couponCode = offer.applied.coupon.code;
        if (offer.applied?.referral && !offer.applied.referral.invalid) doc.referredBy = offer.applied.referral.code;

        // Paid plan → require a verified Razorpay payment when payments are on.
        // On success the student plan is active immediately and they're signed in.
        if (razorpayConfigured() && offer.finalPrice > 0) {
          const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
          if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ message: "No payment was received. Please refresh the page (hard-reload) and try again." });
          }
          if (!verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
            return res.status(400).json({ message: "Payment signature check failed. Please ensure the server's Razorpay keys are a matching Live pair, then try again." });
          }
          const match = await verifyPaidOrder({
            orderId: razorpay_order_id,
            expectedAmountRupees: offer.finalPrice,
            expectedPlan: offer.plan.key,
            expectedEmail: email,
          });
          if (!match.ok) {
            console.error("[payment] student order verification failed", { order: razorpay_order_id, reason: match.reason });
            return res.status(400).json({ message: "Payment could not be verified. Please try again." });
          }
          // Replay protection: a payment id may only activate ONE account.
          const usedPayment = await runUnscoped(() =>
            User.findOne({ $or: [{ paymentId: razorpay_payment_id }, { studentPaymentId: razorpay_payment_id }] }).select("_id")
          );
          if (usedPayment) {
            return res.status(400).json({ message: "This payment has already been used to create an account." });
          }
          doc.isEmailVerified = true;
          doc.studentPaymentId = razorpay_payment_id;
          const exp = new Date();
          exp.setMonth(exp.getMonth() + offer.plan.months);
          doc.studentPlanExpiresAt = exp;
          paidActive = true;
        }
      }
    }
  }

  // Email verified up-front (student/creator inline "Verify", like institutes)?
  // → create the account already-verified and start its plan clock now, so the
  // user is signed straight in and skips the post-signup OTP screen. Falls back
  // to the classic create-unverified + OTP flow when the email wasn't verified.
  const preVerified = !paidActive && (role === "client" || role === "student") && (await emailPreVerified(email));
  if (preVerified) {
    doc.isEmailVerified = true;
    await applyActivationClock(doc);
  }

  // Create the account (UNVERIFIED unless paid or pre-verified above).
  // Retry if the random referral code happens to collide with an existing one.
  let user;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      user = await User.create(doc);
      break;
    } catch (e) {
      if (e?.code === 11000 && e?.keyPattern?.referralCode) { doc.referralCode = makeReferralCode(name); continue; }
      throw e;
    }
  }

  // Count usage of an admin-managed coupon (built-in codes have no DB doc → no-op).
  if (doc.couponCode) redeemCoupon(doc.couponCode).catch(() => {});

  // Record a client's free-trial use against their email (durable, global) so
  // the same email can't claim another client trial later.
  if (role === "client" && doc.isTrial) recordTrialUsed(email, "client").catch(() => {});
  // Same for a student's free trial (durable per-email ledger).
  if (role === "student" && doc.studentTrial) recordTrialUsed(email, "student").catch(() => {});

  // Paid client → already active & verified, sign them straight in (no OTP step).
  if (paidActive) {
    await creditReferrer(user); // friend bought a plan → reward the referrer (+10 days)
    await user.save(); // persist the referrerRewarded flag set above
    notifyNewUser(user);
    return res.status(201).json({ paid: true, token: generateToken(user._id), user: sanitize(user) });
  }

  // Pre-verified email (inline "Verify") → account is already active; sign the
  // user straight in with no post-signup OTP screen.
  if (preVerified) {
    consumeEmailOtp(email);
    notifyNewUser(user);
    return res.status(201).json({ verified: true, token: generateToken(user._id), user: sanitize(user) });
  }

  const otp = await issueOtp(user);
  const emailSent = await sendOtpEmail(email, name, otp).catch(() => false);

  // Only reveal the code on-screen in non-production (local dev) when email
  // couldn't be sent. In production the student MUST verify via the emailed OTP.
  const exposeDevOtp = !emailSent && isDev(); // expose devOtp only in explicit development (secure default)
  res.status(201).json({
    needsVerification: true,
    email,
    emailSent,
    ...(exposeDevOtp ? { devOtp: otp } : {}),
  });
}

// POST /api/auth/verify-otp — confirm the code and activate the account
export async function verifyOtp(req, res) {
  const email = norm(req.body.email);
  const { otp } = req.body;
  const user = await runUnscoped(() => User.findOne({ email }).select("+otpHash +otpExpires +otpAttempts"));
  if (!user) return res.status(400).json({ message: "Account not found" });

  if (!user.isEmailVerified) {
    if (!user.otpHash || !user.otpExpires || user.otpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "Your code has expired. Please request a new one." });
    }
    if (hashOtp(otp) !== user.otpHash) {
      // Cap wrong guesses so the 6-digit OTP can't be brute-forced in its window.
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      if (user.otpAttempts >= 5) { user.otpHash = undefined; user.otpExpires = undefined; await user.save(); return res.status(429).json({ message: "Too many incorrect codes. Please request a new one." }); }
      await user.save();
      return res.status(400).json({ message: "Incorrect code. Please try again." });
    }
    user.isEmailVerified = true;
    user.otpHash = undefined;
    user.otpExpires = undefined;
    user.otpAttempts = 0;
    // Start the client/student subscription clock now that the account is active
    // (paid signups already set their expiry and skip OTP).
    await applyActivationClock(user);
    await user.save();
    notifyNewUser(user); // notify admin of the new registration (fire-and-forget)
  }

  res.json({ user: sanitize(user), token: generateToken(user._id) });
}

// POST /api/auth/resend-otp — send a fresh code
export async function resendOtp(req, res) {
  const email = norm(req.body.email);
  const user = await runUnscoped(() => User.findOne({ email }));
  if (!user) return res.json({ emailSent: false });
  if (user.isEmailVerified) return res.json({ verified: true });

  const otp = await issueOtp(user);
  const emailSent = await sendOtpEmail(email, user.name, otp).catch(() => false);
  const exposeDevOtp = !emailSent && isDev(); // expose devOtp only in explicit development (secure default)
  res.json({ emailSent, ...(exposeDevOtp ? { devOtp: otp } : {}) });
}

// POST /api/auth/login
export async function login(req, res) {
  const { password } = req.body;
  const email = norm(req.body.email);
  const user = await runUnscoped(() => User.findOne({ email }).select("+password"));
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (user.status === "blocked") {
    return res.status(403).json({ message: "Account blocked" });
  }
  if (user.deleted) {
    return res.status(403).json({ message: "This account has been deleted. Please contact the administrator." });
  }
  if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
    return res.status(403).json({ message: "This temporary account has expired. Please contact the administrator." });
  }
  if (await tenantSuspended(user)) {
    return res.status(403).json({ message: SUSPENDED_INSTITUTE_MESSAGE });
  }
  if (!user.isEmailVerified) {
    return res.status(403).json({
      message: "Please verify your email. We can send you a new code.",
      needsVerification: true,
      email,
    });
  }
  res.json({ user: { ...sanitize(user), tenant: await tenantInfo(user.tenantId) }, token: generateToken(user._id) });
}

// POST /api/auth/google  — verify the Google ID token server-side before trusting it.
// The client sends { credential } (the raw Google ID token from Sign In with Google).
// We verify it against Google's public tokeninfo endpoint (or certs) so a forged
// request cannot log in as any email. Falls back to the old { email, name, googleId }
// body ONLY in development for testing convenience.
export async function googleLogin(req, res) {
  const { credential } = req.body;

  let email, name, avatar, googleId;

  if (credential) {
    // Verify the ID token with Google's tokeninfo endpoint.
    try {
      const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!gRes.ok) {
        return res.status(401).json({ message: "Google token verification failed. Please try again." });
      }
      const payload = await gRes.json();
      // Verify the audience matches our app's client ID (prevents tokens issued
      // for OTHER apps from being accepted — without this, a token minted for any
      // Google OAuth client could be replayed here to log in as its email).
      // GOOGLE_CLIENT_ID is REQUIRED: if it isn't configured we refuse rather
      // than skip the check, so a misconfiguration can never open this hole.
      const expectedClientId = process.env.GOOGLE_CLIENT_ID;
      if (!expectedClientId) {
        console.error("[google-login] GOOGLE_CLIENT_ID is not set — refusing to trust Google tokens.");
        return res.status(500).json({ message: "Google login is not configured on the server." });
      }
      if (payload.aud !== expectedClientId) {
        return res.status(401).json({ message: "Google token audience mismatch." });
      }
      if (!payload.email || payload.email_verified === "false") {
        return res.status(401).json({ message: "Google account email not verified." });
      }
      email = norm(payload.email);
      name = payload.name || payload.given_name || "";
      avatar = payload.picture || "";
      googleId = payload.sub;
    } catch (err) {
      console.error("[google-login] Token verification error:", err.message);
      return res.status(500).json({ message: "Failed to verify Google token." });
    }
  } else if (isDev()) {
    // Legacy path: trust raw profile data ONLY when explicitly in development.
    // Secure-by-default — a missing/misspelled NODE_ENV can never enable it.
    email = norm(req.body.email);
    name = req.body.name || "";
    avatar = req.body.avatar || "";
    googleId = req.body.googleId || "";
    if (!email) return res.status(400).json({ message: "Missing Google profile" });
  } else {
    return res.status(400).json({ message: "Google credential token is required." });
  }

  let user = await runUnscoped(() => User.findOne({ email }));
  if (!user) {
    user = await User.create({ name, email, googleId, avatar, isEmailVerified: true });
    notifyNewUser(user); // notify admin of the new registration (fire-and-forget)
  }
  res.json({ user: sanitize(user), token: generateToken(user._id) });
}

// GET /api/auth/verify-email/:token — DEPRECATED: the app uses OTP-based
// verification (verifyOtp) instead. This route is kept only for backwards
// compatibility with very old email links, if any were ever sent.
export async function verifyEmail(req, res) {
  res.status(410).json({ message: "This verification method is no longer supported. Please use the OTP code sent to your email." });
}

// POST /api/auth/forgot-password
export async function forgotPassword(req, res) {
  const user = await runUnscoped(() => User.findOne({ email: norm(req.body.email) }));
  // Always return success to avoid leaking which emails exist.
  if (user) {
    user.resetPasswordToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    // Build the reset link from the site the request came from (falls back to
    // CLIENT_URL, then localhost), so it works even if CLIENT_URL isn't set.
    const resetLink = `${clientBaseFromReq(req)}/reset-password/${user.resetPasswordToken}`;
    const site = await getSiteName();
    await sendMail({
      to: user.email,
      fromName: site,
      subject: `Reset your ${site} password`,
      text: `Hi ${user.name || "there"},\n\nYou requested a password reset. Click this link to set a new password (expires in 1 hour):\n\n${resetLink}\n\nIf you didn't request this, ignore this email — your password won't change.`,
      html: `<p>Hi ${user.name || "there"},</p>
             <p>You requested a password reset. Click the link below to set a new password (expires in 1 hour):</p>
             <p><a href="${resetLink}" style="font-size:16px;font-weight:600">${resetLink}</a></p>
             <p>If you didn't request this, ignore this email — your password won't change.</p>`,
    }).catch((err) => console.error("[forgotPassword] email send failed:", err?.message));
  }
  res.json({ message: "If the account exists, a reset link has been sent." });
}

// POST /api/auth/reset-password/:token
export async function resetPassword(req, res) {
  const user = await runUnscoped(() => User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() },
  }));
  if (!user) return res.status(400).json({ message: "Invalid or expired token" });
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.mustChangePassword = false; // a fresh password clears the forced-change flag
  await user.save();
  res.json({ message: "Password reset successful" });
}

// GET /api/auth/me
export async function getMe(req, res) {
  res.json({ user: { ...sanitize(req.user), tenant: await tenantInfo(req.user.tenantId) } });
}

// PUT /api/auth/profile — let the signed-in user update their own name / photo
export async function updateProfile(req, res) {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  if (typeof req.body.name === "string" && req.body.name.trim()) {
    user.name = req.body.name.trim().slice(0, 80);
  }

  // Email — normalise, validate format and enforce uniqueness (it's the login
  // identifier). Reject if another account already uses it.
  if (typeof req.body.email === "string") {
    const email = norm(req.body.email);
    if (!email) {
      return res.status(400).json({ message: "Email can't be empty." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    if (email !== norm(user.email)) {
      const taken = await runUnscoped(() => User.findOne({ email, _id: { $ne: user._id } }).select("_id"));
      if (taken) {
        return res.status(409).json({ message: "That email is already in use by another account." });
      }
      user.email = email;
    }
  }

  // Phone — optional free-text (digits, spaces and + / - / ( )). Empty clears it.
  if ("phone" in req.body) {
    const phone = String(req.body.phone || "").trim().slice(0, 30);
    if (phone && !/^[+()\-\s\d]{6,30}$/.test(phone)) {
      return res.status(400).json({ message: "Please enter a valid phone number." });
    }
    user.phone = phone;
  }

  if ("avatar" in req.body) {
    const avatar = String(req.body.avatar || "").trim();
    if (avatar) {
      // Accept a hosted image URL or a small data-URI (kept small by the client-side resize).
      if (!/^data:image\/|^https?:\/\//i.test(avatar)) {
        return res.status(400).json({ message: "Please choose a valid image file." });
      }
      if (avatar.length > 3_000_000) {
        return res.status(400).json({ message: "That image is too large — please choose a smaller one." });
      }
    }
    user.avatar = avatar; // empty string clears the photo
  }

  try {
    await user.save();
  } catch (e) {
    // Unique index on email can still collide on a race — surface it cleanly.
    if (e?.code === 11000 && e?.keyPattern?.email) {
      return res.status(409).json({ message: "That email is already in use by another account." });
    }
    throw e;
  }
  res.json({ user: sanitize(user) });
}

// PATCH /api/auth/creator-guide — a creator marks their first-run setup guide
// finished (called by the frontend once all steps are complete) so it never
// auto-opens again. Only meaningful for client accounts.
export async function completeCreatorGuide(req, res) {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  if (user.role === "client") {
    user.set("creatorGuide.completed", true);
    await user.save();
  }
  res.json({ user: sanitize(user) });
}

// GET /api/auth/plans — public list of client subscription plans + pricing.
export async function getPlans(req, res) {
  res.json({ plans: await getClientPlans() });
}

// GET /api/auth/student-plans — public list of STUDENT subscription plans.
export async function getStudentPlans(req, res) {
  res.json({ plans: await loadStudentPlans() });
}

// POST /api/auth/validate-offer — live price preview for a plan with an optional
// coupon and/or friend's referral code (used by the registration/upgrade forms).
// Pass audience:"student" in the body to price against the student catalog.
export async function validateOffer(req, res) {
  const offer = await computeOffer({
    planKey: req.body?.plan,
    couponCode: req.body?.couponCode,
    referralCode: req.body?.referralCode,
    selfEmail: req.body?.email,
    audience: req.body?.audience,
  });
  if (!offer) return res.status(400).json({ message: "Choose a valid plan." });
  res.json(offer);
}
