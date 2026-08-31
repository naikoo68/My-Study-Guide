import { Router } from "express";
import crypto from "crypto";
import User from "../models/User.js";
import { seedDatabase } from "../utils/seedData.js";
import { protect, superAdminOnly } from "../middleware/auth.js";

const router = Router();

// GET /api/setup — one-time bootstrap. Seeds the admin/student/sample content
// ONLY while the database has no admin yet; it becomes inert the moment an admin
// exists and can never be used to wipe an initialized database.
router.get("/", async (req, res) => {
  try {
    const adminExists = await User.exists({ role: "admin" });
    if (adminExists) {
      // Security fix: removed the hardcoded ?force=<token> wipe path entirely.
      // Rebuilding an initialized DB now requires POST /api/setup/reset with an
      // authenticated super-admin AND the per-deploy SETUP_RESET_SECRET.
      return res.status(403).json({
        message:
          "Already initialized — an admin account exists, so setup is disabled. " +
          "To wipe and rebuild, a super-admin must call POST /api/setup/reset with the deploy reset secret.",
      });
    }

    const info = await seedDatabase({ reset: true });
    res.json({
      message: "✅ Setup complete! You can now log in.",
      admin: info.admin,
      student: info.student,
    });
  } catch (e) {
    res.status(500).json({ message: "Setup failed", error: e.message });
  }
});

// POST /api/setup/reset — DESTRUCTIVE wipe & reseed. Security fix: gated behind
// an authenticated super-admin AND a per-deploy env secret (SETUP_RESET_SECRET);
// POST-only with no hardcoded token, so no unauthenticated request can ever wipe
// or reseed the database.
router.post("/reset", protect, superAdminOnly, async (req, res) => {
  const secret = process.env.SETUP_RESET_SECRET;
  if (!secret) {
    // Fail closed when the deploy has not configured a reset secret.
    return res.status(503).json({ message: "Reset is disabled: SETUP_RESET_SECRET is not configured on this deployment." });
  }
  const provided = req.get("x-setup-reset-secret") || req.body?.secret || "";
  // Constant-time compare of SHA-256 digests (equal length, no early-out) so the
  // secret can't be recovered via timing or length differences.
  const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();
  const ok = crypto.timingSafeEqual(digest(provided), digest(secret));
  if (!ok) {
    return res.status(403).json({ message: "Invalid reset secret." });
  }
  try {
    const info = await seedDatabase({ reset: true });
    res.json({
      message: "✅ Database rebuilt with fresh sample data (Subject → Topic → Session → Questions).",
      admin: info.admin,
      student: info.student,
    });
  } catch (e) {
    res.status(500).json({ message: "Reset failed", error: e.message });
  }
});

export default router;
