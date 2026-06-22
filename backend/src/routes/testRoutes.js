import { Router } from "express";
import {
  listTests,
  getTest,
  createTest,
  updateTest,
  togglePublish,
  deleteTest,
  submitTest,
} from "../controllers/testController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/", listTests);
router.get("/:id", protect, getTest);
router.post("/:id/submit", protect, submitTest);

router.post("/", ...admin, createTest);
router.put("/:id", ...admin, updateTest);
router.patch("/:id/publish", ...admin, togglePublish);
router.delete("/:id", ...admin, deleteTest);

export default router;
