import { razorpayConfigured, razorpayKeyId, createRazorpayOrder } from "../config/razorpay.js";
import { computeOffer } from "./authController.js";
import User from "../models/User.js";
import { runUnscoped } from "../utils/tenantContext.js";

// GET /api/payments/config (public) — whether online payment is enabled + the
// public key id. The frontend uses this to decide checkout vs. free signup.
export function paymentConfig(req, res) {
  res.json({ enabled: razorpayConfigured(), keyId: razorpayKeyId() });
}

// POST /api/payments/create-order (public) — create a Razorpay order for the
// chosen client plan after applying coupon/referral. Returns order details for
// Checkout, or { free: true } when the discounted price is 0.
export async function createOrder(req, res) {
  if (!razorpayConfigured()) return res.status(400).json({ message: "Online payments are not enabled." });

  // "student" prices against the student plan catalog (used by student sign-up);
  // anything else falls back to the client catalog (the historical default).
  const audience = req.body?.audience === "student" ? "student" : undefined;

  const email = String(req.body?.email || "").toLowerCase().trim();
  if (email) {
    const exists = await runUnscoped(() => User.findOne({ email }).select("_id"));
    if (exists) return res.status(409).json({ message: "Email already registered. Please log in instead." });
  }

  const offer = await computeOffer({
    planKey: req.body?.plan,
    couponCode: req.body?.couponCode,
    referralCode: req.body?.referralCode,
    selfEmail: email,
    audience,
  });
  if (!offer) return res.status(400).json({ message: "Choose a valid plan." });
  if (offer.finalPrice <= 0) return res.json({ free: true, finalPrice: 0 });

  try {
    const order = await createRazorpayOrder({
      amount: offer.finalPrice,
      receipt: `${audience === "student" ? "stu" : "mpm"}_${offer.plan.key}_${Date.now()}`,
      notes: { plan: offer.plan.key, email, audience: audience || "client" },
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId(),
      finalPrice: offer.finalPrice,
    });
  } catch (e) {
    res.status(502).json({ message: e.message || "Could not start the payment." });
  }
}
