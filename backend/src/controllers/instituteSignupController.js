import crypto from "crypto";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import EmailOtp from "../models/EmailOtp.js";
import generateToken from "../utils/generateToken.js";
import { computeOffer } from "./authController.js";
import { getTenantPlans, trialDays } from "../utils/plans.js";
import { trialClaimed, recordTrialUsed } from "../utils/trialLedger.js";
import { razorpayConfigured, razorpayKeyId, createRazorpayOrder, verifyPaymentSignature } from "../config/razorpay.js";
import { cleanTenantSeed } from "./settingsController.js";
import { runUnscoped } from "../utils/tenantContext.js";
import { notifyNewUser } from "../utils/notify.js";
import { sendMail } from "../config/mailer.js";
import { getSiteName } from "../utils/siteInfo.js";
import { planFlagsSync } from "../utils/siteFlags.js";

// True when the INSTITUTE plans toggle is OFF site-wide. In that state a new
// institute must NOT be asked to pick/pay for a plan — its space is provisioned
// free with no expiry, until the owner turns institute plans back on.
const institutePlansOff = () => planFlagsSync().institutePlansEnabled === false;

// PUBLIC institute self-signup (Phase 5): an institute registers, pays via
// Razorpay (the PLATFORM's account), and its space is auto-provisioned — a
// Tenant, its own settings/branding, and its first institute admin — then the
// admin is signed straight in.
//
// SAFETY: this is only available when tenant isolation is ON
// (TENANT_ENFORCEMENT=on). Without isolation a new institute admin wouldn't be
// scoped and could see platform-wide data, so signup stays disabled until
// enforcement is enabled.

const TRIAL_TENANT_DAYS = 14;

const RESERVED_SLUGS = new Set([
  "www", "api", "app", "admin", "mail", "static", "assets", "cdn", "help",
  "support", "status", "blog", "docs", "dashboard", "login", "signup",
]);

const norm = (e) => String(e || "").toLowerCase().trim();
const normSlug = (s) =>
  String(s || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const validSlug = (s) => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(s);

export const instituteSignupEnabled = () => process.env.TENANT_ENFORCEMENT === "on";

// GET /api/institute-signup/config — plans + payment availability + enabled flag.
export async function signupConfig(req, res) {
  const plansEnabled = !institutePlansOff();
  res.json({
    enabled: instituteSignupEnabled(),
    payEnabled: razorpayConfigured(),
    keyId: razorpayKeyId(),
    // When institute plans are OFF, sign-up is free — the client hides the plan
    // picker and provisions without payment.
    plansEnabled,
    plans: plansEnabled ? await getTenantPlans() : [],
  });
}

// GET /api/institute-signup/availability?slug=&email=
export async function checkAvailability(req, res) {
  const slug = normSlug(req.query.slug || "");
  const email = norm(req.query.email || "");
  const reserved = !!slug && RESERVED_SLUGS.has(slug);
  const [slugTaken, emailTaken] = await runUnscoped(() =>
    Promise.all([
      slug && validSlug(slug) ? Tenant.findOne({ slug }).select("_id") : Promise.resolve(null),
      email ? User.findOne({ email }).select("_id") : Promise.resolve(null),
    ])
  );
  res.json({
    slug,
    slugValid: !!slug && validSlug(slug) && !reserved,
    slugAvailable: !!slug && validSlug(slug) && !reserved && !slugTaken,
    reserved,
    emailAvailable: !email || !emailTaken,
  });
}

// ---- Admin email verification (OTP) ----
// The institute admin's email is verified BEFORE the (paid) space is created,
// so we can't hang the code off a User (there isn't one yet). Codes live in the
// standalone EmailOtp collection, keyed by email, always accessed unscoped.
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function sendSignupOtpEmail(email, otp) {
  const site = await getSiteName();
  return sendMail({
    to: email,
    fromName: site,
    subject: `Your ${site} institute verification code`,
    text: `Your institute sign-up verification code is ${otp}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Your institute sign-up verification code is:</p>
           <p style="font-size:28px;font-weight:800;letter-spacing:6px">${otp}</p>
           <p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
  });
}

// Has this email been verified for signup? Used to gate order + provision.
async function isEmailVerified(email) {
  if (!email) return false;
  const rec = await runUnscoped(() => EmailOtp.findOne({ email, verified: true }).select("_id"));
  return !!rec;
}

// POST /api/institute-signup/send-otp { email } — email a fresh 6-digit code.
export async function sendSignupOtp(req, res) {
  if (!instituteSignupEnabled()) return res.status(400).json({ message: "Institute signup is not available yet." });
  const email = norm(req.body?.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }
  // Don't let someone verify an email that's already tied to an account.
  const taken = await runUnscoped(() => User.findOne({ email }).select("_id"));
  if (taken) return res.status(409).json({ message: "That email is already registered." });

  const otp = genOtp();
  await runUnscoped(() =>
    EmailOtp.findOneAndUpdate(
      { email },
      { email, otpHash: hashOtp(otp), otpExpires: new Date(Date.now() + OTP_TTL_MS), verified: false, verifiedAt: null },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  );

  const emailSent = await sendSignupOtpEmail(email, otp).catch(() => false);
  // Only reveal the code on-screen in non-production when email can't be sent.
  const exposeDevOtp = !emailSent && process.env.NODE_ENV !== "production";
  res.json({ emailSent, ...(exposeDevOtp ? { devOtp: otp } : {}) });
}

// POST /api/institute-signup/verify-otp { email, otp } — confirm the code.
export async function verifySignupOtp(req, res) {
  const email = norm(req.body?.email);
  const otp = String(req.body?.otp || "").trim();
  const rec = await runUnscoped(() => EmailOtp.findOne({ email }));
  if (!rec || !rec.otpHash || !rec.otpExpires || rec.otpExpires.getTime() < Date.now()) {
    return res.status(400).json({ message: "Your code has expired. Please request a new one." });
  }
  if (hashOtp(otp) !== rec.otpHash) {
    return res.status(400).json({ message: "Incorrect code. Please try again." });
  }
  rec.verified = true;
  rec.verifiedAt = new Date();
  rec.otpHash = undefined;
  rec.otpExpires = undefined;
  await runUnscoped(() => rec.save());
  res.json({ verified: true });
}

// Shared validation + offer resolution for order/provision.
async function resolveSignup(body) {
  const name = String(body?.name || "").trim();
  const slug = normSlug(body?.slug || name);
  const adminEmail = norm(body?.adminEmail);
  const offer = await computeOffer({
    planKey: body?.plan,
    couponCode: body?.couponCode,
    referralCode: body?.referralCode,
    selfEmail: adminEmail,
    audience: "tenant",
  });
  return { name, slug, adminEmail, offer };
}

// POST /api/institute-signup/order — create a Razorpay order for a paid plan
// (or signal { free:true } for the trial / a ₹0 total / payments-off).
export async function createInstituteOrder(req, res) {
  if (!instituteSignupEnabled()) return res.status(400).json({ message: "Institute signup is not available yet." });

  // Institute plans OFF → signup is free; no order/payment needed.
  if (institutePlansOff()) return res.json({ free: true, finalPrice: 0 });

  const { name, slug, adminEmail, offer } = await resolveSignup(req.body);
  if (!name) return res.status(400).json({ message: "Institute name is required." });
  if (!validSlug(slug) || RESERVED_SLUGS.has(slug)) return res.status(400).json({ message: "Please choose a valid, available subdomain." });
  if (!adminEmail) return res.status(400).json({ message: "Admin email is required." });
  if (!(await isEmailVerified(adminEmail))) return res.status(400).json({ message: "Please verify your admin email with the code we sent, then continue." });
  if (!offer) return res.status(400).json({ message: "Choose a valid plan." });

  const [slugTaken, emailTaken] = await runUnscoped(() =>
    Promise.all([Tenant.findOne({ slug }).select("_id"), User.findOne({ email: adminEmail }).select("_id")])
  );
  if (slugTaken) return res.status(409).json({ message: "That subdomain is already taken." });
  if (emailTaken) return res.status(409).json({ message: "That admin email is already registered." });

  // One free institute trial per email (durable) — block re-claiming.
  if (offer.plan.key === "trial" && (await trialClaimed(adminEmail, "institute"))) {
    return res.status(400).json({ message: "This email has already used the free institute trial. Please choose a paid plan." });
  }

  if (offer.plan.key === "trial" || offer.finalPrice <= 0 || !razorpayConfigured()) {
    return res.json({ free: true, finalPrice: offer.finalPrice });
  }

  try {
    const order = await createRazorpayOrder({
      amount: offer.finalPrice,
      receipt: `inst_${slug}_${Date.now()}`,
      notes: { slug, email: adminEmail, plan: offer.plan.key, audience: "institute" },
    });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: razorpayKeyId(), finalPrice: offer.finalPrice });
  } catch (e) {
    res.status(502).json({ message: e.message || "Could not start the payment." });
  }
}

// POST /api/institute-signup — verify payment (if any) and PROVISION the
// institute: Tenant + its settings + first institute admin. Signs the admin in.
export async function provisionInstitute(req, res) {
  if (!instituteSignupEnabled()) return res.status(400).json({ message: "Institute signup is not available yet." });

  const { name, slug, adminEmail, offer } = await resolveSignup(req.body);
  const adminName = String(req.body?.adminName || "").trim();
  const adminPassword = String(req.body?.adminPassword || "");

  if (!name) return res.status(400).json({ message: "Institute name is required." });
  if (!validSlug(slug) || RESERVED_SLUGS.has(slug)) return res.status(400).json({ message: "Please choose a valid, available subdomain." });
  if (!adminName || !adminEmail || !adminPassword) return res.status(400).json({ message: "Admin name, email and password are required." });
  if (adminPassword.length < 6) return res.status(400).json({ message: "Admin password must be at least 6 characters." });
  if (!(await isEmailVerified(adminEmail))) return res.status(400).json({ message: "Please verify your admin email with the code we sent, then continue." });

  // Institute plans OFF → provision a FREE space (no plan/payment/trial, never
  // expires) until the owner turns institute plans back on.
  const plansOff = institutePlansOff();
  if (!plansOff && !offer) return res.status(400).json({ message: "Choose a valid plan." });

  const isTrial = !plansOff && offer.plan.key === "trial";
  if (isTrial && (await trialClaimed(adminEmail, "institute"))) {
    return res.status(400).json({ message: "This email has already used the free institute trial. Please choose a paid plan." });
  }
  let paymentId;

  // Paid plan → require a verified Razorpay payment.
  if (!plansOff && !isTrial && razorpayConfigured() && offer.finalPrice > 0) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "No payment was received. Please try again." });
    }
    if (!verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
      return res.status(400).json({ message: "Payment could not be verified. Please try again." });
    }
    paymentId = razorpay_payment_id;
  }

  // Compute validity. When institute plans are OFF the space is free and never
  // expires (expiresAt stays null), so the institute keeps working until the
  // owner turns plans back on.
  let expiresAt = null;
  if (!plansOff) {
    expiresAt = new Date();
    if (isTrial) expiresAt.setDate(expiresAt.getDate() + trialDays(offer.plan, TRIAL_TENANT_DAYS));
    else expiresAt.setMonth(expiresAt.getMonth() + (offer.plan.months || 0));
  }

  // Provision atomically-ish (unscoped: creating a NEW tenant's data). If the
  // admin creation fails, roll back the tenant/settings we just made.
  let created;
  try {
    created = await runUnscoped(async () => {
      const [slugTaken, emailTaken] = await Promise.all([
        Tenant.findOne({ slug }).select("_id"),
        User.findOne({ email: adminEmail }).select("_id"),
      ]);
      if (slugTaken) { const e = new Error("That subdomain is already taken."); e.status = 409; throw e; }
      if (emailTaken) { const e = new Error("That admin email is already registered."); e.status = 409; throw e; }

      const tenant = await Tenant.create({
        name,
        slug,
        status: "active",
        ownerName: adminName,
        ownerEmail: adminEmail,
        subscriptionPlan: plansOff ? "free" : offer.plan.key,
        subscriptionMonths: plansOff || isTrial ? 0 : offer.plan.months,
        subscriptionPrice: plansOff ? 0 : offer.finalPrice,
        isTrial,
        paymentId,
        expiresAt,
      });

      try {
        // The institute's own settings — seeded CLEAN (its name only, no platform
        // demo About/contacts/testimonials), identical to a manually-created
        // institute. Explicit tenantId satisfies the compound (tenantId,key) index.
        await Settings.create({ ...cleanTenantSeed(name), tenantId: tenant._id });

        const admin = await User.create({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          role: "institute_admin",
          tenantId: tenant._id,
          isEmailVerified: true,
        });
        return { tenant, admin };
      } catch (inner) {
        // Roll back partial provisioning.
        await Settings.deleteMany({ tenantId: tenant._id }).catch(() => {});
        await Tenant.deleteOne({ _id: tenant._id }).catch(() => {});
        throw inner;
      }
    });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Could not create the institute." });
  }

  notifyNewUser(created.admin); // fire-and-forget admin notification
  if (isTrial) recordTrialUsed(adminEmail, "institute").catch(() => {}); // durable per-email ledger
  runUnscoped(() => EmailOtp.deleteOne({ email: adminEmail })).catch(() => {}); // one-time code, no longer needed

  res.status(201).json({
    ok: true,
    token: generateToken(created.admin._id),
    tenant: { id: created.tenant._id, name: created.tenant.name, slug: created.tenant.slug },
    admin: { id: created.admin._id, name: created.admin.name, email: created.admin.email, role: created.admin.role },
  });
}
