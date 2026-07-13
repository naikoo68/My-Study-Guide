import { Router } from "express";
import {
  register,
  login,
  googleLogin,
  verifyEmail,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  getMe,
  getPlans,
  validateOffer,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.get("/plans", getPlans);
router.post("/validate-offer", validateOffer);
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", login);
router.post("/google", googleLogin);
router.get("/verify-email/:token", verifyEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get("/me", protect, getMe);

export default router;
