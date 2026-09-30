import { Router } from "express";
import { listProfiles, createProfile, renameProfile, deleteProfile, copyFromMain } from "../controllers/socialProfileController.js";
import { protect, authorize } from "../middleware/auth.js";

// Cross-posting users (admin only).
const router = Router();
const admin = [protect, authorize("admin")];
router.get("/", ...admin, listProfiles);
router.post("/", ...admin, createProfile);
router.put("/:id", ...admin, renameProfile);
router.delete("/:id", ...admin, deleteProfile);
router.post("/:id/copy-from-main", ...admin, copyFromMain);
export default router;
