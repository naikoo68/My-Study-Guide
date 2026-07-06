import crypto from "crypto";
import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import { sendMail } from "../config/mailer.js";

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
  await user.save();
  return otp;
}

async function sendOtpEmail(email, name, otp) {
  return sendMail({
    to: email,
    subject: "Your My Study Guide verification code",
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
  role: u.role,
  plan: u.plan,
  avatar: u.avatar,
  isEmailVerified: u.isEmailVerified,
  expiresAt: u.expiresAt,
  quizAccess: u.quizAccess !== false,
  streak: u.streak,
});

// POST /api/auth/register
export async function register(req, res) {
  const { name, password } = req.body;
  const email = norm(req.body.email);
  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: "Email already registered" });

  // Create the account UNVERIFIED — the user must confirm the OTP to activate it.
  const user = await User.create({ name, email, password, isEmailVerified: false });
  const otp = await issueOtp(user);
  const emailSent = await sendOtpEmail(email, name, otp).catch(() => false);

  // Only reveal the code on-screen in non-production (local dev) when email
  // couldn't be sent. In production the student MUST verify via the emailed OTP.
  const exposeDevOtp = !emailSent && process.env.NODE_ENV !== "production";
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
  const user = await User.findOne({ email }).select("+otpHash +otpExpires");
  if (!user) return res.status(400).json({ message: "Account not found" });

  if (!user.isEmailVerified) {
    if (!user.otpHash || !user.otpExpires || user.otpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "Your code has expired. Please request a new one." });
    }
    if (hashOtp(otp) !== user.otpHash) {
      return res.status(400).json({ message: "Incorrect code. Please try again." });
    }
    user.isEmailVerified = true;
    user.otpHash = undefined;
    user.otpExpires = undefined;
    await user.save();
  }

  res.json({ user: sanitize(user), token: generateToken(user._id) });
}

// POST /api/auth/resend-otp — send a fresh code
export async function resendOtp(req, res) {
  const email = norm(req.body.email);
  const user = await User.findOne({ email });
  if (!user) return res.json({ emailSent: false });
  if (user.isEmailVerified) return res.json({ verified: true });

  const otp = await issueOtp(user);
  const emailSent = await sendOtpEmail(email, user.name, otp).catch(() => false);
  const exposeDevOtp = !emailSent && process.env.NODE_ENV !== "production";
  res.json({ emailSent, ...(exposeDevOtp ? { devOtp: otp } : {}) });
}

// POST /api/auth/login
export async function login(req, res) {
  const { password } = req.body;
  const email = norm(req.body.email);
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (user.status === "blocked") {
    return res.status(403).json({ message: "Account blocked" });
  }
  if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
    return res.status(403).json({ message: "This temporary account has expired. Please contact the administrator." });
  }
  if (!user.isEmailVerified) {
    return res.status(403).json({
      message: "Please verify your email. We can send you a new code.",
      needsVerification: true,
      email,
    });
  }
  res.json({ user: sanitize(user), token: generateToken(user._id) });
}

// POST /api/auth/google  (verify Google token client-side or via google-auth-library)
export async function googleLogin(req, res) {
  const { name, googleId, avatar } = req.body;
  const email = norm(req.body.email);
  if (!email) return res.status(400).json({ message: "Missing Google profile" });
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ name, email, googleId, avatar, isEmailVerified: true });
  }
  res.json({ user: sanitize(user), token: generateToken(user._id) });
}

// GET /api/auth/verify-email/:token
export async function verifyEmail(req, res) {
  const user = await User.findOne({ emailVerificationToken: req.params.token });
  if (!user) return res.status(400).json({ message: "Invalid or expired token" });
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  await user.save();
  res.json({ message: "Email verified successfully" });
}

// POST /api/auth/forgot-password
export async function forgotPassword(req, res) {
  const user = await User.findOne({ email: norm(req.body.email) });
  // Always return success to avoid leaking which emails exist.
  if (user) {
    user.resetPasswordToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();
    // In production: email the reset link with resetPasswordToken.
  }
  res.json({ message: "If the account exists, a reset link has been sent." });
}

// POST /api/auth/reset-password/:token
export async function resetPassword(req, res) {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() },
  });
  if (!user) return res.status(400).json({ message: "Invalid or expired token" });
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ message: "Password reset successful" });
}

// GET /api/auth/me
export async function getMe(req, res) {
  res.json({ user: sanitize(req.user) });
}
