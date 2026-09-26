// AI Educational Slideshow orchestrator.
//
// Given ONE question (the SAME question the existing auto-poster selected), this
// builds a narrated, branded, vertical (9:16) slideshow MP4 that the existing
// Reel pipeline then publishes to Facebook and Instagram:
//
//   question → slide plan → branded slide images (Cloudinary) →
//   TTS narration per slide → ffmpeg MP4 (on this server) → ONE plain MP4
//   uploaded to Cloudinary → public URL
//
// Slides/narration are DETERMINISTIC from the question fields (no AI text/image
// calls). The only external services are the TTS provider (free by default) and
// the project's existing Cloudinary account.
//
// Every step throws a readable error on failure; the caller (the scheduler or
// the test job) records it and, in the scheduler, falls back to a normal
// image/text post so a run is never silently lost.
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { isCloudinaryConfigured, uploadFileToCloudinary } from "./cloudinary.js";
import { resolveTtsConfig, resolveWorkingTtsConfig, synthesizeSpeech } from "./tts.js";
import { buildSlidePlan } from "./slidePlan.js";
import { renderSlideImage } from "./slideRender.js";
import { composeSlideshowMp4, isFfmpegAvailable } from "./videoCompose.js";
import { normalizeVoiceForProvider } from "../utils/ttsVoices.js";

// Job-status states (mirrored onto the schedule's slideshowStatus for the UI).
export const SLIDESHOW_STATUS = {
  PENDING: "PENDING",
  GENERATING_SLIDES: "GENERATING_SLIDES",
  GENERATING_AUDIO: "GENERATING_AUDIO",
  RENDERING_VIDEO: "RENDERING_VIDEO",
  READY: "READY",
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
};

// Media processing needs Cloudinary (slide images + final video hosting). The
// free TTS providers need no key, and ffmpeg is checked when a job runs.
export function isSlideshowConfigured() {
  return isCloudinaryConfigured();
}

// Download a hosted file (the rasterised slide image) to a local path.
async function downloadTo(url, dest, { timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Could not download slide image (${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error("Slide image download was empty.");
    await fs.writeFile(dest, buf);
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Timed out downloading a slide image.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Build the whole slideshow for `question`. Returns:
//   { videoUrl, slides, duration, voice, provider, slidePlan }
// `opts`:
//   voice, autoCaptions, generateImages, brandColor, siteName, siteUrl,
//   subjectName, site (raw Settings doc → resolves the TTS provider/key),
//   onStatus(status) — a callback fired as the job progresses.
export async function generateSlideshow(question, opts = {}) {
  const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : () => {};
  if (!question || typeof question !== "object") throw new Error("A question is required for the slideshow.");
  if (!isCloudinaryConfigured()) throw new Error("Cloudinary is not configured (media processing unavailable).");
  if (!(await isFfmpegAvailable())) {
    throw new Error("ffmpeg is not installed on the server — redeploy the backend (the Docker image installs it).");
  }

  onStatus(SLIDESHOW_STATUS.PENDING);
  // Resolve the TTS provider/key/model from the admin settings (+ env fallback),
  // then pick one that actually works on this host (a blocked free provider,
  // e.g. Edge on a datacenter IP, auto-falls back to the other free provider).
  const ttsCfg = await resolveWorkingTtsConfig(resolveTtsConfig(opts.site || null));
  const voice = normalizeVoiceForProvider(ttsCfg.provider, opts.voice);
  const brandOpts = {
    brandColor: opts.brandColor || "#2563eb",
    siteName: opts.siteName || "My Study Guide",
    siteUrl: opts.siteUrl || "www.mystudyguide.in",
    subjectName: opts.subjectName || "",
    autoCaptions: opts.autoCaptions !== false, // default ON
  };

  // 1) Plan the slides (deterministic, adapts to the question type).
  const plan = buildSlidePlan(question, brandOpts);
  if (!plan.length) throw new Error("Could not build any slides for this question.");

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "msg-slideshow-"));
  try {
    // 2) Render every slide image (branded 9:16 SVG → JPEG on Cloudinary) and
    //    pull it down locally for ffmpeg.
    onStatus(SLIDESHOW_STATUS.GENERATING_SLIDES);
    const imagePaths = [];
    for (let i = 0; i < plan.length; i++) {
      const img = await renderSlideImage(plan[i], brandOpts);
      const p = path.join(workDir, `slide${String(i).padStart(2, "0")}.jpg`);
      await downloadTo(img.url, p);
      imagePaths.push(p);
    }

    // 3) Narrate every slide. Split PER SLIDE (never one giant request) so each
    //    slide is timed to its own narration.
    onStatus(SLIDESHOW_STATUS.GENERATING_AUDIO);
    const audioPaths = [];
    for (let i = 0; i < plan.length; i++) {
      let result;
      try {
        result = await synthesizeSpeech({ text: plan[i].narration, voice, cfg: ttsCfg });
      } catch (e) {
        throw new Error(`Narration failed on slide ${i + 1} (${ttsCfg.provider}): ${e?.message || e}`);
      }
      const p = path.join(workDir, `audio${String(i).padStart(2, "0")}.mp3`);
      await fs.writeFile(p, result.buffer);
      audioPaths.push(p);
    }

    // 4) Compose the MP4 locally (each slide lasts as long as its narration),
    //    then host ONE plain video file on Cloudinary for Meta to fetch.
    onStatus(SLIDESHOW_STATUS.RENDERING_VIDEO);
    const outPath = path.join(workDir, "slideshow.mp4");
    const { duration } = await composeSlideshowMp4({
      slides: plan.map((_, i) => ({ imagePath: imagePaths[i], audioPath: audioPaths[i] })),
      outPath,
      workDir,
    });
    const uploaded = await uploadFileToCloudinary(outPath, {
      resourceType: "video",
      folder: "mystudyguide/slideshow/final",
    });
    if (!uploaded?.secure_url) throw new Error("Cloudinary did not return a URL for the slideshow video.");

    onStatus(SLIDESHOW_STATUS.READY);
    return {
      videoUrl: uploaded.secure_url,
      slides: plan.length,
      duration: Math.round(Number(uploaded.duration) || duration || 0),
      voice,
      provider: ttsCfg.provider,
      slidePlan: plan.map((s) => ({ id: s.id, tag: s.tag })),
    };
  } finally {
    // Always clean up the temp files (images, audio, segments, final MP4).
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
