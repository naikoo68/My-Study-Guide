// AI Educational Slideshow orchestrator.
//
// Given ONE question (the SAME question the existing auto-poster selected), this
// builds a narrated, branded, vertical (9:16) slideshow MP4 that the existing
// Reel pipeline then publishes to Facebook and Instagram:
//
//   question → 2 slides (question, answer) → branded images (Cloudinary) →
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
//   subjectName, questionSec, answerSec (on-screen seconds per slide),
//   site (raw Settings doc → resolves the TTS provider/key),
//   onStatus(status) — a callback fired as the job progresses.
// `question` may be ONE question or an ARRAY of questions (several questions
// in one video: Q1 → A1 → Q2 → A2 → …).
export async function generateSlideshow(question, opts = {}) {
  const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : () => {};
  // Fine-grained progress (stage, done, total) — kept separate from onStatus so
  // callers that persist the status (the scheduled poster) aren't hit per slide.
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  const questions = (Array.isArray(question) ? question : [question]).filter((x) => x && typeof x === "object");
  if (!questions.length) throw new Error("A question is required for the slideshow.");
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

  // On-screen seconds for the two slides (minimums — see composeSlideshowMp4).
  const secs = (v, def) => Math.max(3, Math.min(40, Math.round(Number(v)) || def));
  const questionSec = secs(opts.questionSec, 10);
  const answerSec = secs(opts.answerSec, 8);

  // Optional uploaded templates (backgrounds) for the question / answer slides.
  const templates = {
    question: String(opts.questionTemplateUrl || "").trim(),
    answer: String(opts.answerTemplateUrl || "").trim(),
  };

  // 1) Plan two slides per question (question → answer; adapts to the type).
  // Roughly how many characters each voice speaks per second, so the
  // narration can be fitted to the slide times (see buildSlidePlan).
  const charsPerSec = { gtranslate: 10, edge: 14, openai: 15 }[ttsCfg.provider] || 12;
  const plan = questions.flatMap((q, i) =>
    buildSlidePlan(q, {
      ...brandOpts,
      index: i + 1,
      total: questions.length,
      questionChars: Math.round(questionSec * charsPerSec),
      answerChars: Math.round(answerSec * charsPerSec),
    })
  );
  if (!plan.length) throw new Error("Could not build any slides for this question.");

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "msg-slideshow-"));
  try {
    // 2) Render every slide image (branded 9:16 SVG → JPEG on Cloudinary) and
    //    pull it down locally for ffmpeg.
    onStatus(SLIDESHOW_STATUS.GENERATING_SLIDES);
    onProgress(SLIDESHOW_STATUS.GENERATING_SLIDES, 0, plan.length);
    // Download each template once (if set). A template that can't be fetched
    // is skipped — that slide type falls back to the built-in design.
    const templatePaths = {};
    for (const role of ["question", "answer"]) {
      if (!templates[role]) continue;
      const p = path.join(workDir, `template-${role}`);
      try { await downloadTo(templates[role], p); templatePaths[role] = p; } catch { /* use built-in design */ }
    }
    const imagePaths = [];
    for (let i = 0; i < plan.length; i++) {
      const withTemplate = !!templatePaths[plan[i].role];
      const img = await renderSlideImage(plan[i], { ...brandOpts, transparentBackground: withTemplate });
      const p = path.join(workDir, `slide${String(i).padStart(2, "0")}.${withTemplate ? "png" : "jpg"}`);
      await downloadTo(img.url, p);
      imagePaths.push(p);
      onProgress(SLIDESHOW_STATUS.GENERATING_SLIDES, i + 1, plan.length);
    }

    // 3) Narrate every slide. Split PER SLIDE (never one giant request) so each
    //    slide is timed to its own narration.
    onStatus(SLIDESHOW_STATUS.GENERATING_AUDIO);
    onProgress(SLIDESHOW_STATUS.GENERATING_AUDIO, 0, plan.length);
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
      onProgress(SLIDESHOW_STATUS.GENERATING_AUDIO, i + 1, plan.length);
    }

    // 4) Compose the MP4 locally (each slide lasts as long as its narration),
    //    then host ONE plain video file on Cloudinary for Meta to fetch.
    onStatus(SLIDESHOW_STATUS.RENDERING_VIDEO);
    onProgress(SLIDESHOW_STATUS.RENDERING_VIDEO, 0, plan.length);
    const outPath = path.join(workDir, "slideshow.mp4");
    const { duration } = await composeSlideshowMp4({
      // Slide 1 stays up for the question time, slide 2 for the answer time —
      // or longer when the narration needs it (the voice is never cut off).
      slides: plan.map((s, i) => ({
        imagePath: imagePaths[i],
        audioPath: audioPaths[i],
        minSec: s.role === "answer" ? answerSec : questionSec,
        bgPath: templatePaths[s.role] || null,
      })),
      outPath,
      workDir,
      onProgress: (done, total) => onProgress(SLIDESHOW_STATUS.RENDERING_VIDEO, done, total),
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
      questions: questions.length,
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
