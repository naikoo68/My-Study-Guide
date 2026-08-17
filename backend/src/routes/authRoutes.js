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
  verifyEmailChange,
  resendEmailChangeOtp,
  getPlans,
  validateOffer,
} from "../controllers/authController.js";
import { attachUser } from "../middleware/auth.js";

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
router.get("/me", attachUser, getMe); // expired clients can still load their profile (to upgrade)
router.put("/profile", attachUser, updateProfile); // update own name / profile photo
router.post("/verify-email-change", attachUser, verifyEmailChange); // confirm OTP for a new email
router.post("/resend-email-change-otp", attachUser, resendEmailChangeOtp); // resend the new-email OTP

export default router;
