import crypto from "crypto";
import User from "../models/User.js";
import { getClientPlans } from "../utils/plans.js";
import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";
import PracticeStream from "../models/PracticeStream.js";
import PracticeSubject from "../models/PracticeSubject.js";
import PracticeTopic from "../models/PracticeTopic.js";
import { findAccessEntry } from "../utils/accessControl.js";
import { sendMail } from "../config/mailer.js";

const norm = (e) => String(e || "").toLowerCase().trim();

// Escape regex special characters from user input to prevent ReDoS
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/users  (admin) — with optional search & pagination
export async function listUsers(req, res) {
  const { search = "", page = 1, limit = 20 } = req.query;
  const escaped = escapeRegex(search);
  const filter = search
    ? { $or: [{ name: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }] }
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
  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [{ name: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }];
  }

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
  if (role) {
    // Prevent elevation to admin through the update endpoint — only the bootstrap
    // process or direct DB access should create admin accounts.
    if (role === "admin" && user.role !== "admin") {
      return res.status(403).json({ message: "Cannot elevate a user to admin role" });
    }
    user.role = role;
  }
  if (plan) user.plan = plan;
  if (password) user.password = password; // re-hashed by the model's pre-save hook

  // AI access (admin-controlled, for client accounts). Each is applied only when
  // present in the body so partial updates don't reset the others.
  if ("aiAccess" in req.body) user.aiAccess = !!req.body.aiAccess;
  if ("aiAllowInbuilt" in req.body) user.aiAllowInbuilt = !!req.body.aiAllowInbuilt;
  if ("aiAllowSelf" in req.body) user.aiAllowSelf = !!req.body.aiAllowSelf;
  // Per-feature client workspace access (applied only when present).
  for (const f of ["featDashboard", "featBuild", "featNotes", "featDocuments", "featManual", "featAiGenerator"]) {
    if (f in req.body) user[f] = !!req.body[f];
  }
  // Assign a subscription plan (admin override). Sets the plan key plus its
  // months & price, so both the billing display and the client's AI generation
  // limits follow the chosen plan. Empty clears it.
  if ("subscriptionPlan" in req.body) {
    const key = String(req.body.subscriptionPlan || "");
    if (!key) {
      user.subscriptionPlan = undefined;
    } else {
      user.subscriptionPlan = key;
      const plans = await getClientPlans();
      const p = plans.find((x) => x.key === key);
      if (p) {
        user.subscriptionMonths = p.months;
        user.subscriptionPrice = p.price;
        user.isTrial = !!p.trial;
      }
    }
  }

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

// PATCH /api/users/clients/feature-access  (admin) — apply the given feature
// flags to ALL client accounts at once. Body: { features: { featDashboard,
// featBuild, featNotes, featDocuments, featManual, aiAccess, featAiGenerator } }.
// Only the keys present are applied; the rest are left untouched.
export async function applyClientFeatureAccess(req, res) {
  const f = req.body?.features || {};
  const allowed = ["featDashboard", "featBuild", "featNotes", "featDocuments", "featManual", "aiAccess", "featAiGenerator"];
  const set = {};
  for (const k of allowed) if (k in f) set[k] = !!f[k];
  if (!Object.keys(set).length) return res.status(400).json({ message: "No feature flags provided." });
  const result = await User.updateMany({ role: "client" }, { $set: set });
  res.json({ message: "Applied to all clients", updated: result.modifiedCount ?? result.nModified ?? 0, features: set });
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
  const user = await User.findById(req.params.id).select("name email quizAccess myQuizAccess myTestAccess");
  if (!user) return res.status(404).json({ message: "User not found" });

  const tests = await TestSeries.find({ practice: { $ne: true } }).select("name category access visibleToAll").sort("name").lean();
  res.json({
    userId: user._id,
    name: user.name,
    email: user.email,
    quizAccess: user.quizAccess !== false, // quizzes default ON for everyone
    myQuizAccess: user.myQuizAccess === true, // practice My Quiz — OFF by default
    myTestAccess: user.myTestAccess === true, // practice My Test — OFF by default
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

  let userChanged = false;
  if (typeof req.body.quizAccess === "boolean") { user.quizAccess = req.body.quizAccess; userChanged = true; }
  if (typeof req.body.myQuizAccess === "boolean") { user.myQuizAccess = req.body.myQuizAccess; userChanged = true; }
  if (typeof req.body.myTestAccess === "boolean") { user.myTestAccess = req.body.myTestAccess; userChanged = true; }
  if (userChanged) await user.save();

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

  res.json({ message: "Access updated", quizAccess: user.quizAccess, myQuizAccess: user.myQuizAccess, myTestAccess: user.myTestAccess });
}

// POST /api/users/:id/reset-password  (admin) — issue reset token and email it
export async function adminResetPassword(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.resetPasswordToken = crypto.randomBytes(20).toString("hex");
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
  await user.save();

  // Send the reset link to the user's email.
  const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
  const resetLink = `${clientUrl}/#/reset-password/${user.resetPasswordToken}`;
  await sendMail({
    to: user.email,
    subject: "Password reset requested by admin — My Study Guide",
    text: `Hi ${user.name || "there"},\n\nAn administrator has issued a password reset for your account. Click this link to set a new password (expires in 1 hour):\n\n${resetLink}\n\nIf you didn't expect this, please contact the admin.`,
    html: `<p>Hi ${user.name || "there"},</p>
           <p>An administrator has issued a password reset for your account. Click the link below to set a new password (expires in 1 hour):</p>
           <p><a href="${resetLink}" style="font-size:16px;font-weight:600">${resetLink}</a></p>
           <p>If you didn't expect this, please contact the admin.</p>`,
  }).catch((err) => console.error("[adminResetPassword] email send failed:", err?.message));

  res.json({ message: "Password reset link sent to user's email" });
}
