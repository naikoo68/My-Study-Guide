import { Router } from "express";
import {
  aiStatus, generateQuestions, jobStatus, extractQuestions,
  listKeys, createKey, updateKey, deleteKey, testKey,
} from "../controllers/aiController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/status", ...admin, aiStatus);
router.post("/generate", ...admin, generateQuestions);
router.get("/job/:id", ...admin, jobStatus);
router.post("/extract", ...admin, extractQuestions);

// AI key management (admin)
router.get("/keys", ...admin, listKeys);
router.post("/keys", ...admin, createKey);
router.put("/keys/:id", ...admin, updateKey);
router.delete("/keys/:id", ...admin, deleteKey);
router.post("/keys/:id/test", ...admin, testKey);

export default router;
