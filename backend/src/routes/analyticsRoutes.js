import { Router } from "express";
import {
  platformAnalytics,
  studentDashboard,
  leaderboard,
  publicStats,
  adminPerformance,
  userPerformanceDetail,
  clearUserPerformance,
  clearAllPerformance,
} from "../controllers/analyticsController.js";
import { protect, authorize, optionalAuth } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/stats", publicStats); // public live counts
router.get("/admin/analytics", ...admin, platformAnalytics);
router.get("/admin/performance", ...admin, adminPerformance);
router.get("/admin/performance/user/:userId", ...admin, userPerformanceDetail);
router.delete("/admin/performance/user/:userId", ...admin, clearUserPerformance);
router.delete("/admin/performance", ...admin, clearAllPerformance);
router.get("/me/dashboard", protect, studentDashboard);
router.get("/leaderboard", optionalAuth, leaderboard);

export default router;
