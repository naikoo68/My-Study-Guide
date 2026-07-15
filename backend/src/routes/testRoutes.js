import { Router } from "express";
import {
  listTests,
  listAllTests,
  getTest,
  createTest,
  updateTest,
  togglePublish,
  deleteTest,
  submitTest,
  getTestAccess,
  updateTestAccess,
  getTestQuestions,
  addTestQuestion,
  deleteTestQuestion,
  populateTest,
  toTestSeries,
  toMyTest,
} from "../controllers/testController.js";
import { protect, authorize, optionalAuth } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];
// Shared by admins (platform tests) and clients (their own practice items);
// controllers guard each record by owner.
const manage = [protect, authorize("admin", "client")];

router.get("/", optionalAuth, listTests);
router.get("/admin/all", ...admin, listAllTests);
router.get("/:id/access", ...admin, getTestAccess);
router.put("/:id/access", ...admin, updateTestAccess);
router.get("/:id/questions", ...manage, getTestQuestions);
router.post("/:id/questions", ...manage, addTestQuestion);
router.post("/:id/populate", ...manage, populateTest); // pull questions from quiz/practice bank (admin or owning client)
router.patch("/:id/to-test-series", ...admin, toTestSeries); // My Test → platform Test Series (admin)
router.patch("/:id/to-my-test", ...admin, toMyTest); // platform Test Series → My Test (admin)
router.delete("/:id/questions/:qid", ...manage, deleteTestQuestion);
router.get("/:id", protect, getTest);
router.post("/:id/submit", protect, submitTest);

router.post("/", ...admin, createTest);
router.put("/:id", ...manage, updateTest);
router.patch("/:id/publish", ...admin, togglePublish);
router.delete("/:id", ...manage, deleteTest);

export default router;
