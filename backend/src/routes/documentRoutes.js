import { Router } from "express";
import {
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
} from "../controllers/documentController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/", ...admin, listDocuments);
router.get("/:id", ...admin, getDocument);
router.post("/", ...admin, createDocument);
router.put("/:id", ...admin, updateDocument);
router.delete("/:id", ...admin, deleteDocument);

export default router;
