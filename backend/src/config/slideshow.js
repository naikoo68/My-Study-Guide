// AI Educational Slideshow orchestrator.
//
// Given ONE question (the SAME question the existing auto-poster selected), this
// builds a narrated, branded, vertical (9:16) slideshow MP4 that the existing
// Reel pipeline then publishes to Facebook and Instagram:
//
//   question → slide plan → branded slide images → TTS narration per slide →
//   Cloudinary video composition → MP4 (returned as a public URL)
//
// It reuses the project's single Cloudinary account for all media and the
// server-side TTS service for narration. Text/slide generation is DETERMINISTIC
// from the question fields (no AI text/image calls), so the only paid API here
// is text-to-speech — keeping automatic posting inexpensive.
//
// Every step is best-effort and throws a readable error on failure; the caller
// (the scheduler or the test endpoint) logs it and, in the scheduler, falls back
// to a normal image/text post so a run is never silently lost.
import { isCloudinaryConfigured, composeSlideshowVideo } from "./cloudinary.js";
import { resolveTtsConfig, generateNarrationAudio } from "./tts.js";
import { buildSlidePlan } from "./slidePlan.js";
import { renderSlideImage } from "./slideRender.js";
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

// True only when everything the slideshow needs is configured. The FREE Edge TTS
// provider needs no key, so this is effectively just "is Cloudinary configured".
export function isSlideshowConfigured() {
  return isCloudinaryConfigured();
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

  // Resolve the TTS provider/key/model from the admin settings (+ env fallback).
  const ttsCfg = resolveTtsConfig(opts.site || null);
  const voice = normalizeVoiceForProvider(ttsCfg.provider, opts.voice);
  const autoCaptions = opts.autoCaptions !== false; // default ON
  const brandOpts = {
    brandColor: opts.brandColor || "#2563eb",
    siteName: opts.siteName || "My Study Guide",
    siteUrl: opts.siteUrl || "www.mystudyguide.in",
    subjectName: opts.subjectName || "",
    autoCaptions,
  };

  onStatus(SLIDESHOW_STATUS.PENDING);
  // 1) Plan the slides (deterministic, adapts to the question type).
  const plan = buildSlidePlan(question, brandOpts);
  if (!plan.length) throw new Error("Could not build any slides for this question.");

  // 2) Render every slide image (branded 9:16). Sequential to stay light on the
  //    free-tier server and to keep Cloudinary calls orderly.
  onStatus(SLIDESHOW_STATUS.GENERATING_SLIDES);
  const images = [];
  for (const slide of plan) {
    const img = await renderSlideImage(slide, brandOpts);
    images.push(img);
  }

  // 3) Narrate every slide (TTS → Cloudinary). Split PER SLIDE (never one giant
  //    request) so timing stays synced and no single request is too long.
  onStatus(SLIDESHOW_STATUS.GENERATING_AUDIO);
  const audios = [];
  for (const slide of plan) {
    const audio = await generateNarrationAudio({ text: slide.narration, voice, cfg: ttsCfg });
    audios.push(audio);
  }

  // 4) Compose the slideshow MP4 — each slide shows for its narration length.
  onStatus(SLIDESHOW_STATUS.RENDERING_VIDEO);
  const segments = plan.map((_, i) => ({
    imagePublicId: images[i].publicId,
    audioPublicId: audios[i].publicId,
    audioDuration: audios[i].duration,
  }));
  const composed = await composeSlideshowVideo({ slides: segments });

  onStatus(SLIDESHOW_STATUS.READY);
  return {
    videoUrl: composed.url,
    slides: plan.length,
    duration: Math.round(composed.duration),
    voice,
    provider: ttsCfg.provider,
    slidePlan: plan.map((s) => ({ id: s.id, tag: s.tag })),
  };
}
