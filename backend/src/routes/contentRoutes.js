import { Router } from "express";
import {
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  listSessions,
  createSession,
  updateSession,
  deleteSession,
  listQuestions,
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  deleteQuestion,
} from "../controllers/contentController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

// Subjects
router.get("/subjects", listSubjects);
router.post("/subjects", ...admin, createSubject);
router.put("/subjects/:id", ...admin, updateSubject);
router.delete("/subjects/:id", ...admin, deleteSubject);

// Sessions
router.get("/subjects/:subjectId/sessions", listSessions);
router.post("/sessions", ...admin, createSession);
router.put("/sessions/:id", ...admin, updateSession);
router.delete("/sessions/:id", ...admin, deleteSession);

// Questions
router.get("/sessions/:sessionId/questions", listQuestions);
router.post("/questions", ...admin, createQuestion);
router.post("/questions/bulk", ...admin, bulkCreateQuestions);
router.put("/questions/:id", ...admin, updateQuestion);
router.delete("/questions/:id", ...admin, deleteQuestion);

export default router;
