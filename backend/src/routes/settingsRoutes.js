import { Router } from "express";
import { getSettings, updateSettings, testFacebookPost, testInstagramPost, uploadSelfieWatermark, deleteSelfieWatermark } from "../controllers/settingsController.js";
import { protect, authorize, optionalAuth } from "../middleware/auth.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

const router = Router();

// optionalAuth (not fully public): when a token is present it binds the request
// to the LOGGED-IN user's own institute, so an institute admin reads THEIR
// settings — the SAME doc PUT /settings writes to. Without this, an admin on the
// shared apex domain read the DEFAULT/platform settings while their saves went
// to their own institute, so flags like onboardingCompleted/onboardingDismissed
// never appeared to "stick" and the setup wizard kept returning even after they
// finished it. Unauthenticated visitors still resolve by hostname (public
// branding), unchanged.
router.get("/", optionalAuth, getSettings);
router.put("/", protect, authorize("admin"), updateSettings);
router.post("/facebook/test", protect, authorize("admin"), testFacebookPost);
router.post("/instagram/test", protect, authorize("admin"), testInstagramPost);
router.post("/selfie-watermark", protect, authorize("admin"), upload.single("image"), uploadSelfieWatermark);
router.delete("/selfie-watermark", protect, authorize("admin"), deleteSelfieWatermark);

export default router;
