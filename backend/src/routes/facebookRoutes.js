import { Router } from "express";
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, postScheduleNow, postQuestionNow, scheduleQuestion, previewQuestionImage, suggestTags, backfillScheduleLabels, facebookStats, reconcileFacebook, composeReel } from "../controllers/facebookController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
// Each institute connects its OWN Facebook/Instagram page. Allow institute
// admins too; every route is tenant-scoped, so an institute only sees/uses its
// own schedules, credentials (in its settings) and content.
const admin = [protect, authorize("admin")];

// Scheduled Facebook question auto-posting (admin only). The Page connection
// (id/token/enable) lives in Settings; these routes manage the schedules.
// Permanent Facebook publication ledger: lifetime count + reconciliation with Meta.
router.get("/stats", ...admin, facebookStats);
router.get("/reconcile", ...admin, reconcileFacebook);
router.get("/schedules", ...admin, listSchedules);
router.post("/schedules", ...admin, createSchedule);
// One-off: re-derive the Stream › Subject › Topic breadcrumb for old My Quiz
// schedules. Declared before "/schedules/:id" routes so it isn't shadowed.
router.post("/schedules/backfill-labels", ...admin, backfillScheduleLabels);
router.put("/schedules/:id", ...admin, updateSchedule);
router.delete("/schedules/:id", ...admin, deleteSchedule);
router.post("/schedules/:id/post-now", ...admin, postScheduleNow);

// Per-question actions (from the question view): post now / schedule at a time.
router.post("/post-question", ...admin, postQuestionNow);
router.post("/schedule-question", ...admin, scheduleQuestion);
router.post("/preview-image", ...admin, previewQuestionImage);
router.get("/suggest-tags/:id", ...admin, suggestTags);
// Build a Reel video (vertical MP4) from an uploaded image + audio track.
router.post("/compose-reel", ...admin, composeReel);

export default router;
