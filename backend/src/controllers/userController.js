import crypto from "crypto";
import User from "../models/User.js";
import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";
import PracticeStream from "../models/PracticeStream.js";
import PracticeSubject from "../models/PracticeSubject.js";
import PracticeTopic from "../models/PracticeTopic.js";
import { findAccessEntry } from "../utils/accessControl.js";

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

// GET /api/users/clients  (admin) — self-service client accounts, each with a
// count of the private My Practice content they've created.
export async function listClients(req, res) {
  const { search = "" } = req.query;
  const filter = { role: "client" };
  if (search) filter.$or = [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }];

  const clients = await User.find(filter).select("-password").sort("-createdAt").lean();
  const ids = clients.map((c) => c._id);

  // Owned content counts (practice quizzes vs tests, and total questions).
  const [tsAgg, qAgg] = await Promise.all([
    TestSeries.aggregate([
      { $match: { owner: { $in: ids } } },
      { $group: { _id: { owner: "$owner", kind: "$practiceKind" }, count: { $sum: 1 } } },
    ]),
    Question.aggregate([{ $match: { owner: { $in: ids } } }, { $group: { _id: "$owner", count: { $sum: 1 } } }]),
  ]);

  const quizMap = {};
  const testMap = {};
  tsAgg.forEach((r) => {
    const o = String(r._id.owner);
    if (r._id.kind === "quiz") quizMap[o] = (quizMap[o] || 0) + r.count;
    else testMap[o] = (testMap[o] || 0) + r.count;
  });
  const qMap = Object.fromEntries(qAgg.map((r) => [String(r._id), r.count]));

  res.json({
    clients: clients.map((c) => ({
      ...c,
      quizzes: quizMap[String(c._id)] || 0,
      tests: testMap[String(c._id)] || 0,
      questions: qMap[String(c._id)] || 0,
    })),
    total: clients.length,
  });
}

// POST /api/users  (admin) — create a new user
export async function createUser(req, res) {
  const { name, password, role = "student", plan = "Free", expiresAt } = req.body;
  const email = String(req.body.email || "").toLowerCase().trim();
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: "Email already registered" });

  // Optional temporary-account expiry. Must be a valid future date.
  let expiry = null;
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid expiry date" });
    if (d.getTime() <= Date.now()) return res.status(400).json({ message: "Expiry must be in the future" });
    expiry = d;
  }

  const user = await User.create({ name, email, password, role, plan, isEmailVerified: true, expiresAt: expiry });
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

  // Temporary-account expiry: an explicit value updates it; null/"" clears it
  // (makes the account permanent). Only touched when the key is present.
  if ("expiresAt" in req.body) {
    if (!req.body.expiresAt) {
      user.expiresAt = null;
    } else {
      const d = new Date(req.body.expiresAt);
      if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid expiry date" });
      if (d.getTime() <= Date.now()) return res.status(400).json({ message: "Expiry must be in the future" });
      user.expiresAt = d;
    }
  }

  await user.save();
  const obj = user.toObject();
  delete obj.password;
  res.json(obj);
}

// DELETE /api/users/:id  (admin)
export async function deleteUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  // A client owns private My Practice content — remove it too so nothing is
  // orphaned when the account is deleted.
  if (user.role === "client") {
    await Promise.all([
      Question.deleteMany({ owner: user._id }),
      TestSeries.deleteMany({ owner: user._id }),
      PracticeTopic.deleteMany({ owner: user._id }),
      PracticeSubject.deleteMany({ owner: user._id }),
      PracticeStream.deleteMany({ owner: user._id }),
    ]);
  }
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

// GET /api/users/:id/access  (admin) — what content this user can access
export async function getUserAccess(req, res) {
  const user = await User.findById(req.params.id).select("name email quizAccess");
  if (!user) return res.status(404).json({ message: "User not found" });

  const tests = await TestSeries.find({ practice: { $ne: true } }).select("name category access visibleToAll").sort("name").lean();
  res.json({
    userId: user._id,
    name: user.name,
    email: user.email,
    quizAccess: user.quizAccess !== false, // quizzes default ON for everyone
    tests: tests.map((t) => {
      const entry = findAccessEntry(t, user._id);
      return {
        _id: t._id,
        name: t.name,
        category: t.category,
        visible: entry ? entry.visible : t.visibleToAll === true,
        validUntil: entry?.validUntil || null,
      };
    }),
  });
}

// PUT /api/users/:id/access  (admin) — set quiz access + per-test access for a user
export async function updateUserAccess(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (typeof req.body.quizAccess === "boolean") {
    user.quizAccess = req.body.quizAccess;
    await user.save();
  }

  // Apply per-test access for this single user across the affected tests.
  if (Array.isArray(req.body.tests)) {
    for (const t of req.body.tests) {
      if (!t || !t._id) continue;
      const test = await TestSeries.findById(t._id);
      if (!test) continue;
      const others = (test.access || []).filter((a) => String(a.user) !== String(user._id));
      const wantVisible = t.visible !== false;
      // "Default" depends on whether this test is public or private.
      const isDefault = wantVisible === (test.visibleToAll === true) && !t.validUntil;
      if (isDefault) {
        test.access = others; // remove entry — back to the test's default
      } else {
        others.push({
          user: user._id,
          visible: t.visible !== false,
          validUntil: t.validUntil ? new Date(t.validUntil) : null,
        });
        test.access = others;
      }
      await test.save();
    }
  }

  res.json({ message: "Access updated", quizAccess: user.quizAccess });
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
