import { Router } from "express";
import { listTenants, getTenant, createTenant, updateTenantStatus, createTenantAdmin } from "../controllers/tenantController.js";
import { protect, superAdminOnly } from "../middleware/auth.js";

const router = Router();

// Platform super-admin only — managing the institutes themselves is never an
// institute_admin action.
const superAdmin = [protect, superAdminOnly];

router.get("/", ...superAdmin, listTenants);
router.post("/", ...superAdmin, createTenant);
router.get("/:id", ...superAdmin, getTenant);
router.patch("/:id/status", ...superAdmin, updateTenantStatus);
router.post("/:id/admin", ...superAdmin, createTenantAdmin); // create an institute admin for a tenant

export default router;
