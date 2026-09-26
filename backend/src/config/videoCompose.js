// Compose the AI Slideshow MP4 LOCALLY with ffmpeg (installed in the Docker
// image — see backend/Dockerfile). Each slide = one still image + its narration
// MP3; the slide stays on screen for exactly as long as its narration (with a
// small tail and a minimum), then all segments are concatenated into ONE
// 1080×1920 (9:16) H.264 / AAC MP4 — a standard Reel file Meta accepts.
//
// Why local ffmpeg instead of Cloudinary transformations: a multi-clip
// concatenation of audio-only assets via Cloudinary's splice overlays is
// fragile and slow to derive, and Meta then has to fetch a lazily-rendered
// transformation URL (the same class of "Unable to fetch video" problems the
// single-image Reel had). Encoding here and uploading ONE finished, plain MP4 is
// deterministic, fast, and gives Meta a normal stored file.
//
// SECURITY: ffmpeg is spawned with an ARGUMENT ARRAY (no shell), and every path
// is a server-generated temp file — no user input ever reaches a command line.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export function ffmpegPath() {
  return String(process.env.FFMPEG_PATH || "").trim() || "ffmpeg";
}

// Run ffmpeg with `args`; resolves with its stderr text (ffmpeg logs there).
function runFfmpeg(args, { timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let child;
    try {
      child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      return reject(e);
    }
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      reject(new Error("ffmpeg timed out while rendering the slideshow."));
    }, timeoutMs);
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000); // keep the tail only
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        e?.code === "ENOENT"
          ? new Error("ffmpeg is not installed on the server (redeploy the backend image, or set FFMPEG_PATH).")
          : e
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stderr);
      const tail = stderr.trim().split("\n").slice(-3).join(" | ");
      reject(new Error(`ffmpeg failed (exit ${code})${tail ? `: ${tail.slice(0, 300)}` : ""}`));
    });
  });
}

// Cached "is ffmpeg usable here?" check.
let _ffmpegOk = null;
export async function isFfmpegAvailable() {
  if (_ffmpegOk !== null) return _ffmpegOk;
  try {
    await runFfmpeg(["-hide_banner", "-version"], { timeoutMs: 15000 });
    _ffmpegOk = true;
  } catch {
    _ffmpegOk = false;
  }
  return _ffmpegOk;
}

// Parse the "Duration: HH:MM:SS.xx" ffmpeg prints for an input → seconds.
function parseDuration(text) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(text || ""));
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// Duration (s) of a media file, via ffmpeg's input probe (ffmpeg exits non-zero
// with no output specified, so read its stderr either way).
export async function probeDuration(file) {
  try {
    const out = await runFfmpeg(["-hide_banner", "-i", file, "-f", "null", "-"], { timeoutMs: 60000 });
    return parseDuration(out);
  } catch (e) {
    return parseDuration(e?.message || "");
  }
}

// Build the slideshow MP4.
//   slides:  [{ imagePath, audioPath, minSec?, bgPath? }]  (local files, in
//            order; minSec = how long this slide stays up at least; bgPath =
//            an optional template image drawn underneath the slide)
//   outPath: where to write the final MP4
// Returns { duration } (seconds).
export async function composeSlideshowMp4({
  slides = [],
  outPath,
  workDir,
  width = 1080,
  height = 1920,
  fps = 25,
  minSec = 3,
  tailSec = 0.6,
  maxTotalSec = 88, // Facebook Reels limit is 90 s — keep a small margin
} = {}) {
  const list = (Array.isArray(slides) ? slides : []).filter((s) => s?.imagePath && s?.audioPath);
  if (!list.length) throw new Error("No slides to compose.");
  if (!outPath || !workDir) throw new Error("composeSlideshowMp4 needs outPath and workDir.");

  const segPaths = [];
  for (let i = 0; i < list.length; i++) {
    const seg = path.join(workDir, `seg${String(i).padStart(2, "0")}.mp4`);
    // Video: loop the still, fit it into the 9:16 canvas (white pad), yuv420p
    //        for player/Meta compatibility.
    // Audio: resample, add a short tail, and pad to at least `minSec`; the
    //        segment ends with the audio (-shortest), so the slide stays up for
    //        exactly its narration (+tail), never a fixed length.
    // With a TEMPLATE, the template image fills the frame (cover-cropped to
    // 9:16) and the slide (a PNG with a transparent surround) is laid on top.
    const bg = list[i].bgPath;
    const vf = bg
      ? `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[bg];` +
        `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`
      : `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p[v]`;
    const audioIdx = bg ? 2 : 1;
    // Each slide may carry its own on-screen time (question / answer time).
    const slideMin = Math.max(1, Number(list[i].minSec) || minSec);
    const af = `[${audioIdx}:a]aresample=44100,apad=pad_dur=${tailSec},apad=whole_dur=${slideMin}[a]`;
    const imageInputs = bg
      ? ["-loop", "1", "-framerate", String(fps), "-i", bg, "-loop", "1", "-framerate", String(fps), "-i", list[i].imagePath]
      : ["-loop", "1", "-framerate", String(fps), "-i", list[i].imagePath];
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      ...imageInputs,
      "-i", list[i].audioPath,
      "-filter_complex", `${vf};${af}`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-r", String(fps),
      "-pix_fmt", "yuv420p", "-threads", "2",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100",
      "-shortest",
      seg,
    ]);
    segPaths.push(seg);
  }

  // Concatenate the (identically-encoded) segments without re-encoding, and put
  // the moov atom first (+faststart) so Meta/browsers can start streaming it.
  const listFile = path.join(workDir, "segments.txt");
  await fs.writeFile(listFile, segPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-c", "copy", "-movflags", "+faststart",
    outPath,
  ]);

  let duration = await probeDuration(outPath);

  // Facebook Reels (via the API) must be ≤ 90 s. If the video is only a little
  // over, gently SPEED IT UP to fit (at most 1.15×, so speech stays natural;
  // picture and sound change together, so they stay in sync). A longer video
  // is kept whole — it is NEVER cut off: Instagram Reels accept up to 15
  // minutes, and Facebook falls back to a normal video post.
  if (duration > maxTotalSec && duration / maxTotalSec <= 1.15) {
    const factor = duration / maxTotalSec;
    const fitted = path.join(workDir, "slideshow-fit.mp4");
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", outPath,
      "-filter:v", `setpts=PTS/${factor.toFixed(4)}`,
      "-filter:a", `atempo=${factor.toFixed(4)}`,
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(fps), "-threads", "2",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100",
      "-movflags", "+faststart",
      fitted,
    ]);
    await fs.rename(fitted, outPath);
    duration = await probeDuration(outPath);
  }
  return { duration };
}
