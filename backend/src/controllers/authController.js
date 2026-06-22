import crypto from "crypto";
import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";

const sanitize = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  plan: u.plan,
  avatar: u.avatar,
  isEmailVerified: u.isEmailVerified,
  streak: u.streak,
});

// POST /api/auth/register
export async function register(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: "Email already registered" });

  const emailVerificationToken = crypto.randomBytes(20).toString("hex");
  const user = await User.create({ name, email, password, emailVerificationToken });

  // In production: send verification email containing emailVerificationToken.
  res.status(201).json({
    message: "Registered. Please verify your email.",
    user: sanitize(user),
    token: generateToken(user._id),
  });
}

// POST /api/auth/login
export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (user.status === "blocked") {
    return res.status(403).json({ message: "Account blocked" });
  }
  res.json({ user: sanitize(user), token: generateToken(user._id) });
}

// POST /api/auth/google  (verify Google token client-side or via google-auth-library)
export async function googleLogin(req, res) {
  const { email, name, googleId, avatar } = req.body;
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
  const user = await User.findOne({ email: req.body.email });
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
