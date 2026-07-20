import { Router } from "express";
import {
  getCbtExam,
  registerCbtView,
  submitCbt,
  getCbtResult,
  listCbtExams,
  listCbtCandidates,
  publishCbt,
  unpublishCbt,
  cbtLeaderboard,
} from "../controllers/cbtController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

// Public (NO auth) — students sign in with just their name + email on the client
// and submit; nothing here requires an account. Declared before admin routes.
router.get("/exam/:token", getCbtExam);
router.post("/exam/:token/view", registerCbtView); // count an open (impression)
router.post("/exam/:token/submit", submitCbt);
router.get("/result/:resultToken", getCbtResult); // printable result page

// Admin — manage exams and view rankings.
router.get("/admin/exams", ...admin, listCbtExams);
router.get("/admin/candidates", ...admin, listCbtCandidates); // My Tests to pull
router.get("/admin/:id/leaderboard", ...admin, cbtLeaderboard);
router.patch("/admin/:id/publish", ...admin, publishCbt);
router.patch("/admin/:id/unpublish", ...admin, unpublishCbt);

export default router;
