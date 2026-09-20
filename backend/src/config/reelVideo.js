// Slideshow-Reel renderer — turns one or more still images + an optional music
// track into a short vertical (9:16) MP4 that can be published as a Reel.
//
// WHY THIS EXISTS
// ---------------
// A "Reel" is a VIDEO. Facebook/Instagram's Reel APIs will not accept "an image
// + a song" and build the clip for you (and their licensed music catalogue is
// app-only, never available through the API). So to auto-post an image-based
// Reel we must first BUILD the video ourselves: each image is shown for a set
// number of seconds, padded onto a 1080x1920 canvas, and an admin-provided
// music track (royalty-free / their own) is laid underneath. The finished MP4 is
// hosted on Cloudinary (a public URL the Reel API can fetch).
//
// ffmpeg comes from `ffmpeg-static` (a bundled binary installed via npm), so no
// system ffmpeg install is required on the host.

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadVideo } from "./cloudinary.js";

// Reel canvas — vertical 1080x1920 (9:16), 30fps. Standard for FB/IG Reels.
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

// Clamp seconds-per-image to a sane range (matches the settings validation).
export function clampSecondsPerImage(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(60, n));
}

// PURE: build the ffmpeg CLI argument list for a slideshow.
//   imagePaths       — local image files, shown in order
//   audioPath        — optional local audio file (looped, trimmed to the video)
//   secondsPerImage  — how long each image is shown (already clamped)
//   outPath          — output .mp4 path
// Each image is scaled to FIT inside 1080x1920 (no crop) then padded (letterbox)
// so the whole image is always visible; SAR is normalised and a constant fps is
// forced so the concat filter joins them cleanly. When audio is present it is
// looped (-stream_loop) and the output is capped to the slideshow length so the
// music never makes the clip longer or shorter than the images.
// Exported for unit tests (no I/O).
export function buildSlideshowFfmpegArgs({ imagePaths = [], audioPath = "", secondsPerImage = 10, outPath = "out.mp4" } = {}) {
  const sec = clampSecondsPerImage(secondsPerImage);
  const n = imagePaths.length;
  if (!n) throw new Error("At least one image is required.");
  const total = sec * n;

  const args = ["-y"];
  for (const img of imagePaths) args.push("-loop", "1", "-t", String(sec), "-i", img);
  const hasAudio = !!audioPath;
  if (hasAudio) args.push("-stream_loop", "-1", "-i", audioPath);

  // Per-image: fit-inside → pad → square pixels → constant fps. Then concat.
  const scalePad =
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS},format=yuv420p`;
  let filter = "";
  for (let i = 0; i < n; i++) filter += `[${i}:v]${scalePad}[v${i}];`;
  for (let i = 0; i < n; i++) filter += `[v${i}]`;
  filter += `concat=n=${n}:v=1:a=0[v]`;

  args.push("-filter_complex", filter, "-map", "[v]");
  if (hasAudio) {
    args.push("-map", `${n}:a`, "-c:a", "aac", "-b:a", "128k", "-t", String(total));
  } else {
    args.push("-an");
  }
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", outPath);
  return args;
}

// Fetch a remote URL to a local file. Throws on a non-OK response.
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return dest;
}

// Run ffmpeg to completion. Resolves on exit 0, rejects with stderr otherwise.
function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => { err += String(d); });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-500) || `ffmpeg exited ${code}`))));
  });
}

// Resolve the ffmpeg binary from ffmpeg-static (optional dependency). Returns
// the path, or "" when the package isn't installed so callers can fail softly.
async function resolveFfmpeg() {
  try {
    const mod = await import("ffmpeg-static");
    return (mod?.default || mod || "").toString();
  } catch {
    return "";
  }
}

// Build a slideshow Reel from image URLs (+ optional music URL) and upload the
// resulting MP4 to Cloudinary. Returns { ok, url } or { ok:false, error }.
// Never throws — a failure here must not break the posting pipeline.
export async function renderSlideshowReel({ imageUrls = [], audioUrl = "", secondsPerImage = 10 } = {}) {
  const images = (imageUrls || []).map((u) => String(u || "").trim()).filter(Boolean).slice(0, 10);
  if (!images.length) return { ok: false, error: "Add at least one image for the Reel." };

  const ffmpegPath = await resolveFfmpeg();
  if (!ffmpegPath) return { ok: false, error: "Video engine (ffmpeg-static) is not installed on the server." };

  let dir = "";
  try {
    dir = await mkdtemp(path.join(tmpdir(), "reel-"));
    // Download every image; skip any that fail so one broken URL can't abort.
    const imagePaths = [];
    for (let i = 0; i < images.length; i++) {
      const p = path.join(dir, `img${i}.jpg`);
      try { await download(images[i], p); imagePaths.push(p); } catch { /* skip broken image */ }
    }
    if (!imagePaths.length) return { ok: false, error: "Could not download any of the images." };

    let audioPath = "";
    if (audioUrl) {
      try { audioPath = await download(String(audioUrl).trim(), path.join(dir, "music")); } catch { audioPath = ""; }
    }

    const outPath = path.join(dir, "reel.mp4");
    const args = buildSlideshowFfmpegArgs({ imagePaths, audioPath, secondsPerImage, outPath });
    await runFfmpeg(ffmpegPath, args);

    // Upload the finished MP4 to Cloudinary (data URI keeps it engine-agnostic).
    const mp4 = await readFile(outPath);
    const dataUri = `data:video/mp4;base64,${mp4.toString("base64")}`;
    const { url } = await uploadVideo(dataUri, { folder: "mystudyguide/reels" });
    if (!url) return { ok: false, error: "Could not host the Reel video." };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not render the Reel video." };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
