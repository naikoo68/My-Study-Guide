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

const router = Router();

router.get("/plans", getPlans);
router.get("/student-plans", getStudentPlans);
router.post("/validate-offer", validateOffer);
router.post("/send-email-otp", sendEmailOtp); // pre-account email verification (student/creator inline "Verify")
router.post("/verify-email-otp", verifyEmailOtp);
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
router.patch("/creator-guide", attachUser, completeCreatorGuide); // creator marks first-run setup guide done

export default router;
