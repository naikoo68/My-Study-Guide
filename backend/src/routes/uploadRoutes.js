import { Router } from "express";
import multer from "multer";
import cloudinary, { uploadToCloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();

// GET /api/upload/signature (admin) — returns the params for a SIGNED, DIRECT
// browser → Cloudinary upload. This lets big media go straight to Cloudinary
// instead of relaying through our (free-tier) server, which is slow and can
// time out ("Cannot reach the server"). The api_secret never leaves the server
// — it's only used here to sign; the api_key it returns is public by design.
router.get("/signature", protect, authorize("admin"), (req, res) => {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({ message: "Image uploads aren't set up yet (Cloudinary keys missing)." });
  }
  const timestamp = Math.round(Date.now() / 1000);
  const folder = "mystudyguide/social";
  // The signature must cover every param sent to Cloudinary EXCEPT file,
  // api_key, resource_type and cloud_name — here that's folder + timestamp.
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, process.env.CLOUDINARY_API_SECRET);
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature,
  });
});

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
  // Video — used by the Reel uploader (custom Facebook/Instagram posts). The
  // direct browser → Cloudinary path is preferred for large videos; this is the
  // server-relay fallback, so keep it to the widely-supported container types.
  "video/mp4", "video/quicktime", "video/webm",
  // Audio — used to build a Reel from an image + audio track (Cloudinary mixes
  // them into an MP4). Common container/codec MIME types browsers report.
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/aac", "audio/x-m4a",
  "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm",
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
    // MP4/MOV (and other ISO-BMFF) begin with a box-size word then the "ftyp"
    // brand marker at bytes 4–8. Both containers share this header.
    case "video/mp4":
    case "video/quicktime":
      return b.length >= 12 && b.slice(4, 8).toString("ascii") === "ftyp";
    // WebM/Matroska start with the EBML magic 0x1A45DFA3.
    case "video/webm": return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    // Office/csv/text/avif have no simple universal signature — the MIME
    // allowlist + Cloudinary processing is the control for those.
    default: return true;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB — allows PDFs/docs and short Reel videos
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
