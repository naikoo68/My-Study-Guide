import { Router } from "express";
import {
  listActiveNotices,
  listNotices,
  createNotice,
  updateNotice,
  deleteNotice,
  clearContentNotices,
} from "../controllers/noticeController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const admin = [protect, authorize("admin")];

router.get("/", listActiveNotices); // public — ticker
router.get("/all", ...admin, listNotices);
router.post("/", ...admin, createNotice);
router.delete("/content", ...admin, clearContentNotices); // must precede "/:id" so "content" isn't read as an id
router.put("/:id", ...admin, updateNotice);
router.delete("/:id", ...admin, deleteNotice);

export default router;
