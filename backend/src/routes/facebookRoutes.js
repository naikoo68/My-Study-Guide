import { Router } from "express";
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, postScheduleNow } from "../controllers/facebookController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

// Scheduled Facebook question auto-posting (admin only). The Page connection
// (id/token/enable) lives in Settings; these routes manage the schedules.
router.get("/schedules", ...admin, listSchedules);
router.post("/schedules", ...admin, createSchedule);
router.put("/schedules/:id", ...admin, updateSchedule);
router.delete("/schedules/:id", ...admin, deleteSchedule);
router.post("/schedules/:id/post-now", ...admin, postScheduleNow);

export default router;
