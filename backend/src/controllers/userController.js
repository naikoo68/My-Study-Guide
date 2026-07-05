import crypto from "crypto";
import User from "../models/User.js";

const norm = (e) => String(e || "").toLowerCase().trim();

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

// POST /api/users  (admin) — create a new user
export async function createUser(req, res) {
  const { name, password, role = "student", plan = "Free" } = req.body;
  const email = String(req.body.email || "").toLowerCase().trim();
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: "Email already registered" });
  const user = await User.create({ name, email, password, role, plan, isEmailVerified: true });
  const obj = user.toObject();
  delete obj.password;
  res.status(201).json(obj);
}

// PUT /api/users/:id  (admin) — edit name, email, role, plan and optionally password
export async function updateUser(req, res) {
  const user = await User.findById(req.params.id).select("+password");
  if (!user) return res.status(404).json({ message: "User not found" });

  const { name, role, plan, password } = req.body;

  if (req.body.email) {
    const email = norm(req.body.email);
    if (email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists) return res.status(409).json({ message: "That email is already in use" });
      user.email = email;
    }
  }
  if (name) user.name = name;
  if (role) user.role = role;
  if (plan) user.plan = plan;
  if (password) user.password = password; // re-hashed by the model's pre-save hook

  await user.save();
  const obj = user.toObject();
  delete obj.password;
  res.json(obj);
}

// DELETE /api/users/:id  (admin)
export async function deleteUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
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
