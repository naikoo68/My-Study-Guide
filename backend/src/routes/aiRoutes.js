import { Router } from "express";
import { aiStatus, generateQuestions } from "../controllers/aiController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/status", ...admin, aiStatus);
router.post("/generate", ...admin, generateQuestions);

export default router;
