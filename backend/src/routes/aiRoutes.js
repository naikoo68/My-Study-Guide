import { Router } from "express";
import { aiStatus, generateQuestions, jobStatus } from "../controllers/aiController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/status", ...admin, aiStatus);
router.post("/generate", ...admin, generateQuestions);
router.get("/job/:id", ...admin, jobStatus);

export default router;
