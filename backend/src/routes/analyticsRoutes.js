import { Router } from "express";
import {
  platformAnalytics,
  studentDashboard,
  leaderboard,
} from "../controllers/analyticsController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/admin/analytics", protect, authorize("admin"), platformAnalytics);
router.get("/me/dashboard", protect, studentDashboard);
router.get("/leaderboard", leaderboard);

export default router;
