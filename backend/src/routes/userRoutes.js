import { Router } from "express";
import {
  listUsers,
  toggleStatus,
  updatePlan,
  adminResetPassword,
} from "../controllers/userController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/", ...admin, listUsers);
router.patch("/:id/status", ...admin, toggleStatus);
router.patch("/:id/plan", ...admin, updatePlan);
router.post("/:id/reset-password", ...admin, adminResetPassword);

export default router;
