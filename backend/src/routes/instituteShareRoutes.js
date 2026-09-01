import { Router } from "express";
import { shareToInstitutes, shareJobStatus } from "../controllers/instituteShareController.js";
import { protect, superAdminOnly } from "../middleware/auth.js";

const router = Router();

// Platform super-admin only — copying platform content into institutes is never
// an institute_admin action.
const superAdmin = [protect, superAdminOnly];

router.post("/", ...superAdmin, shareToInstitutes); // COPY a node into institute(s)
router.get("/job/:id", ...superAdmin, shareJobStatus); // poll progress

export default router;
