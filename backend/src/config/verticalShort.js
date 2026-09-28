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
export async function makeVerticalShort(inPath) {
  const outPath = path.join(os.tmpdir(), `msg-short-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  // Blurred cover fill (scaled up + cropped) behind the whole video fitted in
  // the middle. Audio is copied through. One re-encode of the (short) video.
  const vf =
    `[0:v]split[fg][bgsrc];` +
    `[bgsrc]scale=${SHORT_W}:${SHORT_H}:force_original_aspect_ratio=increase,crop=${SHORT_W}:${SHORT_H},boxblur=40:2,eq=brightness=-0.10,setsar=1[bg];` +
    `[fg]scale=${SHORT_W}:${SHORT_H}:force_original_aspect_ratio=decrease,setsar=1[fgs];` +
    `[bg][fgs]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`;
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inPath,
    "-filter_complex", vf,
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "25", "-threads", "2",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
    outPath,
  ], { timeoutMs: 300000 });
  return outPath;
}

// Is a duration within the YouTube Short limit (3 minutes)?
export { probeDuration };
