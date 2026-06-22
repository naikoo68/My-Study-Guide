import crypto from "crypto";
import User from "../models/User.js";

// GET /api/users  (admin) — with optional search & pagination
export async function listUsers(req, res) {
  const { search = "", page = 1, limit = 20 } = req.query;
  const filter = search
    ? { $or: [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }] }
    : {};
  const users = await User.find(filter)
    .select("-password")
    .sort("-createdAt")
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await User.countDocuments(filter);
  res.json({ users, total, page: Number(page) });
}

// PATCH /api/users/:id/status  (admin) — block / unblock
export async function toggleStatus(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.status = user.status === "blocked" ? "active" : "blocked";
  await user.save();
  res.json({ id: user._id, status: user.status });
}

// PATCH /api/users/:id/plan  (admin) — manage subscription
export async function updatePlan(req, res) {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { plan: req.body.plan },
    { new: true }
  ).select("-password");
  res.json(user);
}

// POST /api/users/:id/reset-password  (admin) — issue reset token
export async function adminResetPassword(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.resetPasswordToken = crypto.randomBytes(20).toString("hex");
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
  await user.save();
  // In production: email the reset link to the user.
  res.json({ message: "Password reset link issued" });
}
