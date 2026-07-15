import { Router } from "express";
import {
  aiStatus, generateQuestions, jobStatus, extractQuestions,
  listKeys, createKey, bulkCreateKeys, updateKey, deleteKey, testKey, importEnvKeys, testAllKeys, listKeyModels,
} from "../controllers/aiController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];
// Clients may generate/import questions with AI too (they use the shared keys
// the platform owner configured). Key MANAGEMENT stays admin-only below.
const manage = [protect, authorize("admin", "client")];

router.get("/status", ...manage, aiStatus);
router.post("/generate", ...manage, generateQuestions);
router.get("/job/:id", ...manage, jobStatus);
router.post("/extract", ...manage, extractQuestions);

// AI key management (admin)
router.get("/keys", ...admin, listKeys);
router.post("/keys", ...admin, createKey);
router.post("/keys/bulk", ...admin, bulkCreateKeys); // add many keys at once (shared preset)
router.post("/keys/import", ...admin, importEnvKeys); // import Render env keys into the DB
router.post("/keys/test-all", ...admin, testAllKeys); // test every key at once
router.put("/keys/:id", ...admin, updateKey);
router.delete("/keys/:id", ...admin, deleteKey);
router.post("/keys/:id/test", ...admin, testKey);
router.post("/keys/:id/models", ...admin, listKeyModels); // list models this key can use

export default router;
