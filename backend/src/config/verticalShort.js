// Make a VERTICAL (9:16, 1080×1920) copy of a finished landscape video, so
// YouTube will treat it as a Short. YouTube only classifies a video as a Short
// when it is vertical/square AND ≤ 3 min — a 16:9 video with "#Shorts" stays a
// normal video. We keep the same content: the landscape video is centred on a
// blurred, dimmed fill of itself (the look Reels use), never cropped.
import path from "node:path";
import os from "node:os";
import { runFfmpeg, probeDuration } from "./videoCompose.js";

export const SHORT_W = 1080;
export const SHORT_H = 1920;

// inPath (landscape mp4) → a new 9:16 mp4 path. Throws on failure; the caller
// deletes the file afterwards.
//   durationSec — the input's length (for progress + a length-based time limit)
//   onProgress(done, total) — optional, done/total in 0–100
// The blurred background is made from a SMALL (1/4-size) copy and scaled back
// up: it looks the same (it's blurred anyway) but is ~15× less work than
// blurring a full 1080×1920 frame — that step was taking many minutes on the
// server and looked "stuck" at the Short's rendering stage.
export function verticalShortFilter() {
  const bw = SHORT_W / 4, bh = SHORT_H / 4;
  return (
    `[0:v]split[fg][bgsrc];` +
    `[bgsrc]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=10:2,eq=brightness=-0.10,scale=${SHORT_W}:${SHORT_H},setsar=1[bg];` +
    `[fg]scale=${SHORT_W}:${SHORT_H}:force_original_aspect_ratio=decrease,setsar=1[fgs];` +
    `[bg][fgs]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`
  );
}

export async function makeVerticalShort(inPath, { maxSec = 0, durationSec = 0, onProgress } = {}) {
  const outPath = path.join(os.tmpdir(), `msg-short-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  const trim = maxSec > 0 ? ["-t", String(Math.max(1, Math.round(maxSec)))] : [];
  // Blurred cover fill (scaled up + cropped) behind the whole video fitted in
  // the middle. Audio is copied through. One re-encode of the (short) video.
  const vf = verticalShortFilter();
  const total = Number(maxSec) > 0 ? Math.min(Number(maxSec), Number(durationSec) || Infinity) : Number(durationSec) || 0;
  // Up to ~6× the video's length (min 5 min, max 20 min) — a slow server still finishes.
  const timeoutMs = Math.max(300000, Math.min(1200000, Math.round(total * 6000)));
  const report = typeof onProgress === "function" && total > 0
    ? (sec) => onProgress(Math.max(0, Math.min(100, Math.round((sec / total) * 100))), 100)
    : undefined;
  if (typeof onProgress === "function") onProgress(0, 100);
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inPath,
    ...trim,
    "-filter_complex", vf,
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "25", "-threads", "2",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
    outPath,
  ], { timeoutMs, onTimeSec: report });
  if (typeof onProgress === "function") onProgress(100, 100);
  return outPath;
}

// Is a duration within the YouTube Short limit (3 minutes)?
export { probeDuration };
