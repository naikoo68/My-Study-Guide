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
  updateProfile,
  completeCreatorGuide,
  getPlans,
  getStudentPlans,
  validateOffer,
  sendEmailOtp,
  verifyEmailOtp,
} from "../controllers/authController.js";
import { attachUser } from "../middleware/auth.js";
import { loginLimiter, loginAccountLimiter, otpLimiter, otpAccountLimiter, forgotLimiter, registerLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.get("/plans", getPlans);
router.get("/student-plans", getStudentPlans);
router.post("/validate-offer", validateOffer);
// Brute-force protection: IP + per-account rate limiting on OTP/login/reset.
router.post("/send-email-otp", otpLimiter, sendEmailOtp); // pre-account email verification (student/creator inline "Verify")
router.post("/verify-email-otp", otpLimiter, otpAccountLimiter, verifyEmailOtp);
router.post("/register", registerLimiter, register);
router.post("/verify-otp", otpLimiter, otpAccountLimiter, verifyOtp);
router.post("/resend-otp", otpLimiter, resendOtp);
router.post("/login", loginLimiter, loginAccountLimiter, login);
router.post("/google", loginLimiter, googleLogin);
router.get("/verify-email/:token", verifyEmail);
router.post("/forgot-password", forgotLimiter, forgotPassword);
router.post("/reset-password/:token", otpLimiter, resetPassword);
router.get("/me", attachUser, getMe); // expired clients can still load their profile (to upgrade)
router.put("/profile", attachUser, updateProfile); // update own name / profile photo
router.patch("/creator-guide", attachUser, completeCreatorGuide); // creator marks first-run setup guide done

export default router;
