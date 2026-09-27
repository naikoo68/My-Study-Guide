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
      const err = new Error(`ffmpeg failed (exit ${code})${tail ? `: ${tail.slice(0, 300)}` : ""}`);
      err.stderr = stderr; // full log (the probes below read the input info from it)
      reject(err);
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

// Pixel size of an image/video file → { width, height } (0s when unknown), from
// the "Stream … Video: …, 1200x1600" line ffmpeg prints for an input.
export async function probeImageSize(file) {
  let text = "";
  try { text = await runFfmpeg(["-hide_banner", "-i", file], { timeoutMs: 30000 }); } catch (e) { text = e?.stderr || e?.message || ""; }
  const m = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(String(text));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 0, height: 0 };
}

// Duration (s) of a media file from its header. ffmpeg with only an input (no
// output) prints the input info — incl. "Duration:" — and exits non-zero, so
// read its stderr either way. (Never decode the whole file just to measure it:
// on a small VM that alone took seconds for a 90 s video.)
export async function probeDuration(file) {
  let text = "";
  try { text = await runFfmpeg(["-hide_banner", "-i", file], { timeoutMs: 30000 }); } catch (e) { text = e?.stderr || e?.message || ""; }
  const d = parseDuration(text);
  if (d > 0) return d;
  // Header had no usable duration (rare, e.g. some raw streams): decode to measure.
  try {
    return parseDuration(await runFfmpeg(["-hide_banner", "-i", file, "-f", "null", "-"], { timeoutMs: 60000 }));
  } catch (e) {
    return parseDuration(e?.stderr || e?.message || "");
  }
}

// Build the slideshow MP4.
//   slides:  [{ imagePath, audioPath?, minSec?, pauseSec?, bgPath? }]  (local files, in
//            order; no audioPath = a silent slide; pauseSec = extra silence after
//            the narration;
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
  onProgress = null, // (done, total) after each slide segment — for the UI's ETA
} = {}) {
  // A slide with no audioPath is SILENT (it lasts its minSec).
  const list = (Array.isArray(slides) ? slides : []).filter((s) => s?.imagePath);
  if (!list.length) throw new Error("No slides to compose.");
  if (!outPath || !workDir) throw new Error("composeSlideshowMp4 needs outPath and workDir.");

  // Speed matters here: this runs on a small VM, and a 5-question video has 10
  // slides. Each slide is a STILL picture, so:
  //   1) the picture is composed ONCE into a single 1080×1920 PNG (template
  //      fit/blur + slide overlay) — never re-filtered for every video frame;
  //   2) that PNG is fed at 1 fps and repeated up to `fps` by the encoder —
  //      repeated frames are near-free for x264;
  //   3) the ≤90 s Reel speed-up is worked out BEFORE encoding (from the
  //      narration lengths) and applied to the audio in the same pass, so the
  //      finished video never needs a second full re-encode.
  // (Measured on 1 core, one 12 s slide: 15.5 s before → 3.0 s now, same image.)
  const slideMins = list.map((s) => Math.max(1, Number(s.minSec) || minSec));
  // Extra silent seconds AFTER a slide's narration (e.g. thinking time before
  // an answer reveal), on top of the normal short tail.
  const pauses = list.map((s) => Math.max(0, Math.min(30, Number(s.pauseSec) || 0)));
  const audioSecs = [];
  for (const s of list) audioSecs.push(s.audioPath ? await probeDuration(s.audioPath) : 0);
  // Each slide lasts its narration (+ tail + pause), but at least its on-screen time.
  const plannedTotal = audioSecs.reduce((sum, a, i) => sum + Math.max(a + tailSec + pauses[i], slideMins[i]), 0);
  // Facebook Reels (via the API) must be ≤ 90 s. If the video is only a little
  // over, gently SPEED IT UP to fit (at most 1.15×, so speech stays natural;
  // the slides are stills, so only the audio tempo changes and it stays in
  // sync). A longer video is kept whole — it is NEVER cut off: Instagram Reels
  // accept up to 15 minutes, and Facebook falls back to a normal video post.
  const factor = plannedTotal > maxTotalSec && plannedTotal / maxTotalSec <= 1.15 ? plannedTotal / maxTotalSec : 1;

  const segPaths = [];
  for (let i = 0; i < list.length; i++) {
    const n = String(i).padStart(2, "0");
    const frame = path.join(workDir, `frame${n}.png`);
    const seg = path.join(workDir, `seg${n}.mp4`);
    // 1) The picture, composed once. With a TEMPLATE, the WHOLE template is
    //    shown — scaled to FIT (contain), never cropped, so its logo / buttons
    //    at the edges stay visible; leftover space (a template that isn't
    //    exactly 9:16) is filled with a blurred, dimmed copy of it, like Reels
    //    do. The slide (a PNG with a transparent surround) is laid on top.
    //    Without a template, the slide is fitted onto a white 9:16 canvas.
    const bg = list[i].bgPath;
    const frameFilter = bg
      ? `[0:v]setsar=1,split[tf][tb];` +
        `[tb]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=40:2,eq=brightness=-0.06,setsar=1[blur];` +
        `[tf]scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1[fit];` +
        `[blur][fit]overlay=(W-w)/2:(H-h)/2[bg];` +
        `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2`
      : `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:white,setsar=1`;
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      ...(bg ? ["-i", bg] : []),
      "-i", list[i].imagePath,
      "-filter_complex", frameFilter,
      "-frames:v", "1",
      frame,
    ], { timeoutMs: 60000 });

    // 2) Encode the still + its narration.
    // Audio: resample, add a short tail, and pad to at least the slide's
    //        on-screen time; the segment ends with the audio (-shortest), so
    //        the slide stays up for exactly its narration (+tail).
    const tempo = factor > 1 ? `,atempo=${factor.toFixed(4)}` : "";
    // Silent slide → a short silence source, padded to the slide time below.
    const silent = !list[i].audioPath;
    const tail = silent ? 0 : tailSec + pauses[i];
    const af = `[1:a]aresample=44100,apad=pad_dur=${tail},apad=whole_dur=${slideMins[i]}${tempo}[a]`;
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      "-loop", "1", "-framerate", "1", "-i", frame,
      ...(silent ? ["-f", "lavfi", "-t", "0.1", "-i", "anullsrc=r=44100:cl=stereo"] : ["-i", list[i].audioPath]),
      "-filter_complex", `[0:v]format=yuv420p,fps=${fps}[v];${af}`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-r", String(fps),
      "-pix_fmt", "yuv420p", "-threads", "2",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100",
      "-shortest",
      seg,
    ]);
    segPaths.push(seg);
    if (typeof onProgress === "function") onProgress(i + 1, list.length);
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

  // (The ≤90 s speed-up was already applied per slide above — no re-encode.)
  const duration = await probeDuration(outPath);
  return { duration };
}
