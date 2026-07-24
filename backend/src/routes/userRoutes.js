import { Router } from "express";
import {
  listUsers,
  listClients,
  createUser,
  updateUser,
  deleteUser,
  toggleStatus,
  updatePlan,
  adminResetPassword,
  getUserAccess,
  updateUserAccess,
  applyClientFeatureAccess,
} from "../controllers/userController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/", ...admin, listUsers);
router.get("/clients", ...admin, listClients); // self-service client accounts
router.patch("/clients/feature-access", ...admin, applyClientFeatureAccess); // apply feature flags to ALL clients
router.post("/", ...admin, createUser);
router.put("/:id", ...admin, updateUser);
router.delete("/:id", ...admin, deleteUser);
router.patch("/:id/status", ...admin, toggleStatus);
router.patch("/:id/plan", ...admin, updatePlan);
router.post("/:id/reset-password", ...admin, adminResetPassword);
router.get("/:id/access", ...admin, getUserAccess);
router.put("/:id/access", ...admin, updateUserAccess);

export default router;
