import { Router } from "express";
import {
  aiStatus, generateQuestions, jobStatus, extractQuestions, generateNotes, extendExplanations, extendOneExplanation, regenerateQuestion, regenerateAll,
  listKeys, createKey, bulkCreateKeys, updateKey, deleteKey, testKey, importEnvKeys, testAllKeys, listKeyModels, autoDetectKeyModel,
  getAiAccess, setAiMode, inferTopic, coverageGaps, outlineUnits,
} from "../controllers/aiController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];
// Clients may generate/import questions with AI too. Key MANAGEMENT is also
// open to clients but every controller scopes strictly to the caller's own
// keys (admin → platform keys, client → their own), so pools never mix.
const manage = [protect, authorize("admin", "client")];

router.get("/status", ...manage, aiStatus);
router.post("/generate", ...manage, generateQuestions);
router.get("/job/:id", ...manage, jobStatus);
router.post("/extract", ...manage, extractQuestions);
router.post("/notes", ...manage, generateNotes); // generate study notes (Markdown) on a topic
router.post("/infer-topic", ...manage, inferTopic); // name the topic a quiz's existing questions belong to
router.post("/coverage-gaps", ...manage, coverageGaps); // list uncovered syllabus areas for a topic
router.post("/outline-units", ...manage, outlineUnits); // detect units/chapters/topics in a PDF/source
router.post("/extend-explanations", ...manage, extendExplanations); // AI-enrich all explanations in a quiz/test
router.post("/extend-explanation", ...manage, extendOneExplanation); // AI-enrich ONE question's explanation
router.post("/regenerate-question", ...manage, regenerateQuestion); // analyse ONE question and rebuild its options/answer
router.post("/regenerate-all", ...manage, regenerateAll); // regenerate EVERY question in a quiz/test (background job)

// Client AI access + pool selection (admin allowed too; setMode is client-only).
router.get("/access", ...manage, getAiAccess);
router.put("/mode", ...manage, setAiMode);

// AI key management — owner-scoped (admin manages platform keys; a client
// manages only their OWN keys).
router.get("/keys", ...manage, listKeys);
router.post("/keys", ...manage, createKey);
router.post("/keys/bulk", ...manage, bulkCreateKeys); // add many keys at once (shared preset)
router.post("/keys/import", ...admin, importEnvKeys); // import Render env keys — platform only
router.post("/keys/test-all", ...manage, testAllKeys); // test every key in the caller's pool
router.put("/keys/:id", ...manage, updateKey);
router.delete("/keys/:id", ...manage, deleteKey);
router.post("/keys/:id/test", ...manage, testKey);
router.post("/keys/:id/models", ...manage, listKeyModels); // list models this key can use
router.post("/keys/:id/auto-model", ...manage, autoDetectKeyModel); // auto-find + set a working model

export default router;
