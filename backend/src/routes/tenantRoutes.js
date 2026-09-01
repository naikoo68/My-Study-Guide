import { Router } from "express";
import { listTenants, getTenant, createTenant, updateTenantStatus, createTenantAdmin, setTenantDomain, deleteTenant, updateTenantFeatures, updateAllTenantsFeatures, updateTenantSharing, updateAllTenantsSharing } from "../controllers/tenantController.js";
import { protect, superAdminOnly } from "../middleware/auth.js";

const router = Router();

// Platform super-admin only — managing the institutes themselves is never an
// institute_admin action.
const superAdmin = [protect, superAdminOnly];

router.get("/", ...superAdmin, listTenants);
router.post("/", ...superAdmin, createTenant);
router.patch("/features", ...superAdmin, updateAllTenantsFeatures); // set access for ALL institutes at once
router.patch("/sharing", ...superAdmin, updateAllTenantsSharing); // GLOBAL switch: platform content/AI-key sharing for ALL institutes
router.get("/:id", ...superAdmin, getTenant);
router.patch("/:id/status", ...superAdmin, updateTenantStatus);
router.post("/:id/admin", ...superAdmin, createTenantAdmin); // create an institute admin for a tenant
router.patch("/:id/domain", ...superAdmin, setTenantDomain); // set/clear the institute's custom domain
router.patch("/:id/features", ...superAdmin, updateTenantFeatures); // set which features this institute can access
router.patch("/:id/sharing", ...superAdmin, updateTenantSharing); // per-institute: platform content/AI-key sharing (default OFF)
router.delete("/:id", ...superAdmin, deleteTenant); // permanently delete an institute + all its data

export default router;
