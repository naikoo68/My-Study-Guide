import { Router } from "express";
import multer from "multer";
import { uploadToCloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();

// Allowlist of accepted upload content types (images + PDF + common docs). Only
// these MIME types are accepted; anything else (scripts, HTML, SVG, executables)
// is rejected so an uploaded file can't carry active/script content.
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "text/plain",
]);
// Magic-number sniffing for the common binary types, so the real bytes must
// match the declared MIME (a .png that's actually HTML/JS is rejected).
function contentMatchesMime(buf, mime) {
  if (!buf || buf.length < 4) return false;
  const b = buf;
  const startsWith = (...bytes) => bytes.every((x, i) => b[i] === x);
  switch (mime) {
    case "image/jpeg": return startsWith(0xff, 0xd8, 0xff);
    case "image/png": return startsWith(0x89, 0x50, 0x4e, 0x47);
    case "image/gif": return startsWith(0x47, 0x49, 0x46, 0x38);
    case "application/pdf": return startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/webp": return b.length >= 12 && startsWith(0x52, 0x49, 0x46, 0x46) && b.slice(8, 12).toString("ascii") === "WEBP";
    // Office/csv/text/avif have no simple universal signature — the MIME
    // allowlist + Cloudinary processing is the control for those.
    default: return true;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — allows PDFs/docs, not just images
  // Reject disallowed content types before the file is buffered.
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    const e = new Error(`Unsupported file type: ${file.mimetype}`);
    e.status = 415; // surfaced as 415 by the central error handler (not a 500)
    cb(e);
  },
});

// POST /api/upload  (admin) — uploads a file (image, PDF, doc…) to Cloudinary.
router.post("/", protect, authorize("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    // Defence-in-depth: the declared MIME must be allowlisted AND match the bytes.
    if (!ALLOWED_MIME.has(req.file.mimetype) || !contentMatchesMime(req.file.buffer, req.file.mimetype)) {
      return res.status(415).json({ message: "Unsupported or mismatched file type." });
    }
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        message: "File uploads aren't set up yet. Ask the admin to add Cloudinary keys, or paste a file link instead.",
      });
    }
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const { url, format, bytes } = await uploadToCloudinary(dataUri);
    res.status(201).json({ url, format, bytes, name: req.file.originalname });
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

export default router;
