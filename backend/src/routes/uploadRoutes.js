import { Router } from "express";
import multer from "multer";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// POST /api/upload  (admin) — uploads an image to Cloudinary, returns its URL.
router.post("/", protect, authorize("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const url = await uploadToCloudinary(dataUri);
    res.status(201).json({ url });
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

export default router;
