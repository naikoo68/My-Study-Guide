import { Router } from "express";
import { getSettings, updateSettings, testFacebookPost, testInstagramPost } from "../controllers/settingsController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();

router.get("/", getSettings);
router.put("/", protect, authorize("admin"), updateSettings);
router.post("/facebook/test", protect, authorize("admin"), testFacebookPost);
router.post("/instagram/test", protect, authorize("admin"), testInstagramPost);

export default router;
