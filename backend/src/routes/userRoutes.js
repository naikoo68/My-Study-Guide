import { Router } from "express";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  toggleStatus,
  updatePlan,
  adminResetPassword,
} from "../controllers/userController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/", ...admin, listUsers);
router.post("/", ...admin, createUser);
router.put("/:id", ...admin, updateUser);
router.delete("/:id", ...admin, deleteUser);
router.patch("/:id/status", ...admin, toggleStatus);
router.patch("/:id/plan", ...admin, updatePlan);
router.post("/:id/reset-password", ...admin, adminResetPassword);

export default router;
