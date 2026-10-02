// /api/voice-studio — your own cloned voice on your own voice server (admin).
import { Router } from "express";
import multer from "multer";
import { protect, authorize } from "../middleware/auth.js";
import * as c from "../controllers/voiceStudioController.js";

const router = Router();
const admin = [protect, authorize("admin")];

// Recordings stay in memory and go straight on to the voice server.
const MAX_MB = 50;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac|mp4|weba)$/i;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    // Browsers label recordings audio/webm or audio/mp4 — sometimes video/webm or video/mp4.
    if (/^audio\//.test(file.mimetype) || /^video\/(webm|mp4)$/.test(file.mimetype) || AUDIO_EXT.test(file.originalname || "")) return cb(null, true);
    const e = new Error(`"${file.originalname}" is not an audio file.`);
    e.status = 415;
    cb(e);
  },
});
// multer's own errors → a clear 413 instead of a 500.
const files = (req, res, next) => upload.array("files", 20)(req, res, (err) => {
  if (err?.code === "LIMIT_FILE_SIZE") { err.status = 413; err.message = `Each recording can be up to ${MAX_MB} MB.`; }
  else if (err?.code === "LIMIT_FILE_COUNT" || err?.code === "LIMIT_UNEXPECTED_FILE") { err.status = 413; err.message = "Up to 20 recordings at a time."; }
  next(err);
});

router.get("/status", ...admin, c.status);
router.get("/voices", ...admin, c.listVoices);
router.post("/voices", ...admin, files, c.createVoice);
router.patch("/voices/:id", ...admin, c.updateVoice);
router.delete("/voices/:id", ...admin, c.deleteVoice);
router.post("/voices/:id/samples", ...admin, files, c.addSamples);
router.get("/voices/:id/samples/:sampleId", ...admin, c.sampleAudio);
router.delete("/voices/:id/samples/:sampleId", ...admin, c.deleteSample);
router.post("/speak", ...admin, c.speak);
router.post("/narrator", ...admin, c.useAsNarrator);

export default router;
