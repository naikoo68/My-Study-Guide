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
import { buildSlidePlan, normalizeReadOptions, readOptionsFromSettings } from "./slidePlan.js";
import { chunkForGoogle } from "./googleTts.js";
import { renderSlideImage } from "./slideRender.js";
import { renderSlideCardShots } from "./cardShot.js";
import { composeSlideshowMp4, isFfmpegAvailable, probeImageSize } from "./videoCompose.js";
import { normalizeVoiceForProvider, voiceForFallback } from "../utils/ttsVoices.js";

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

// A full explanation + key points + quick recall can be longer than one TTS
// request allows (synthesizeSpeech hard-caps at 1200 characters and would CUT
// the rest). Split long narration at sentence boundaries, synthesize each part
// and join the MP3s (same encoder settings, so they play back-to-back).
const TTS_PART_CHARS = 1000;
async function synthesizeLongSpeech({ text, voice, cfg }) {
  const parts = chunkForGoogle(text, TTS_PART_CHARS);
  if (parts.length <= 1) return synthesizeSpeech({ text, voice, cfg });
  const buffers = [];
  let usedVoice = voice;
  for (const part of parts) {
    const r = await synthesizeSpeech({ text: part, voice, cfg });
    buffers.push(r.buffer);
    usedVoice = r.voice || usedVoice;
  }
  return { buffer: Buffer.concat(buffers), voice: usedVoice };
}

// "both" = question + answer slide per question (default); "question" = only
// the question slide. Anything else → "both".
export function normalizeSlidesMode(v) {
  return String(v || "").trim().toLowerCase() === "question" ? "question" : "both";
}

// The reveal slide IS the question slide (just recoloured) → same template.
const templateRole = (role) => (role === "reveal" ? "question" : role);

// Question-only mode's answer reveal (all in seconds):
//   pauseSec — silent thinking time after the question is read (0–15, default 3)
//   showSec  — how long the green correct option stays up (1–15, default 3)
//   say      — also say "The correct answer is option B: <its text>." (default on)
// From the caller (the test form) else the site settings.
export function revealOptions(input, site) {
  const src = input && typeof input === "object" ? input : {
    pauseSec: site?.slideshowRevealPauseSec,
    showSec: site?.slideshowRevealSec,
    say: site?.slideshowRevealSay,
  };
  const num = (v, def, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : def; };
  return { pauseSec: num(src.pauseSec, 3, 0, 15), showSec: num(src.showSec, 3, 1, 15), say: src.say !== false };
}

// The reveal slide: the question slide again, with the correct option marked
// (green). Silent unless `say`. Null when the question has no valid answer.
export function revealSlide(qSlide, q, reveal) {
  const idx = Number.isInteger(q?.correct) ? q.correct : -1;
  const opt = (qSlide.options || [])[idx];
  if (!opt) return null;
  return {
    ...qSlide,
    id: "reveal",
    role: "reveal",
    options: qSlide.options.map((o, i) => ({ ...o, correct: i === idx })),
    // Say the option's TEXT too ("…option B: 1, 2 and 3."), not just the
    // letter. `spoken` is already speech-ready (math, tables, ₹ … handled).
    narration: reveal.say
      ? `The correct answer is option ${opt.spokenBadge || opt.badge}${opt.spoken ? `: ${opt.spoken}` : "."}`
      : "",
    // Always a caption (even when silent): the caption band takes room on the
    // card, so the question slide and its reveal must BOTH have one — then the
    // layout is identical and only the colour changes.
    caption: `Correct answer: ${opt.badge}${opt.text ? `. ${opt.text}` : ""}`,
    minSec: reveal.showSec,
  };
}

// Build the whole slideshow for `question`. Returns:
//   { videoUrl, slides, duration, voice, provider, slidePlan }
// `opts`:
//   voice, autoCaptions, generateImages, brandColor, siteName, siteUrl,
//   subjectName, questionSec, answerSec (on-screen seconds per slide),
//   site (raw Settings doc → resolves the TTS provider/key),
//   slidesMode — "both" (question + answer slides) or "question" (question
//          slides only); default: the site setting slideshowSlides, else "both",
//   read — what the narrator reads ({ question, options, explanation,
//          keyPoints, quickRecall }; default: the site settings, all ON),
//   onStatus(status) — a callback fired as the job progresses.
// `question` may be ONE question or an ARRAY of questions (several questions
// in one video: Q1 → A1 → Q2 → A2 → …).
export async function generateSlideshow(question, opts = {}) {
  const userOnStatus = typeof opts.onStatus === "function" ? opts.onStatus : () => {};
  // Remember when each step started, so the server log shows where the time
  // goes (e.g. "slides 42s, audio 18s, video 35s, upload 6s").
  const stepMarks = [];
  const onStatus = (st) => { stepMarks.push([st, Date.now()]); userOnStatus(st); };
  // Fine-grained progress (stage, done, total) — kept separate from onStatus so
  // callers that persist the status (the scheduled poster) aren't hit per slide.
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  const questions = (Array.isArray(question) ? question : [question]).filter((x) => x && typeof x === "object");
  // Long YouTube video mode: 16:9 1920×1080 slides, no Reel length speed-up,
  // no 9:16 templates, and (keepFile) the MP4 is handed back as a local file
  // instead of being hosted on Cloudinary (long videos are big).
  const landscape = opts.orientation === "landscape";
  const keepFile = !!opts.keepFile;
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
  // The chosen voice — or, if the chosen provider is blocked here and the other
  // free one is used, that provider's voice with the SAME accent.
  const voice = ttsCfg.requestedProvider
    ? voiceForFallback(ttsCfg.provider, opts.voice)
    : normalizeVoiceForProvider(ttsCfg.provider, opts.voice);
  const ttsNote = ttsCfg.requestedProvider
    ? `${ttsCfg.requestedProvider} voices are unavailable on this server (${ttsCfg.fallbackReason || "blocked"}) — used ${ttsCfg.provider} "${voice}" instead.`
    : "";
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
  // The caller passes the RIGHT set: the 9:16 Reel templates, or the 16:9
  // long-video templates for a landscape video.
  const templates = {
    question: String(opts.questionTemplateUrl || "").trim(),
    answer: String(opts.answerTemplateUrl || "").trim(),
  };

  // 1) Plan two slides per question (question → answer; adapts to the type).
  // What the narrator reads: the caller's choice (the test form's current
  // toggles), else the saved site settings; everything ON by default.
  const read = opts.read ? normalizeReadOptions(opts.read) : readOptionsFromSettings(opts.site);
  // Which slides each question gets: "both" (question → answer, default) or
  // "question" (question slide only — the answer isn't revealed in the video).
  const slidesMode = normalizeSlidesMode(opts.slidesMode ?? opts.site?.slideshowSlides);
  // Question-only mode: after the question is read, pause (thinking time),
  // then show the SAME slide with the correct option turned green.
  const reveal = revealOptions(opts.reveal, opts.site);
  const plan = [];
  const planQuestions = []; // the question each slide belongs to (same order as plan)
  questions.forEach((q, i) => {
    const [qSlide, aSlide] = buildSlidePlan(q, {
      ...brandOpts,
      index: i + 1,
      total: questions.length,
      read,
    });
    const slides = slidesMode === "both"
      ? [qSlide, aSlide]
      : [{ ...qSlide, pauseSec: reveal.pauseSec }, revealSlide(qSlide, q, reveal)];
    for (const s of slides.filter(Boolean)) { plan.push(s); planQuestions.push(q); }
  });
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
    // Template sizes, so the slide can place its card inside the template as
    // it's actually shown (fitted, never cropped — see composeSlideshowMp4).
    const templateSizes = {};
    for (const role of Object.keys(templatePaths)) templateSizes[role] = await probeImageSize(templatePaths[role]).catch(() => null);
    // First choice: screenshot the real student-view components (Inter font,
    // KaTeX math, same option / answer cards as posts and Reels) — one browser
    // for every slide, PNGs written straight into workDir.
    const shotPaths = plan.map((_, i) => path.join(workDir, `shot${String(i).padStart(2, "0")}.png`));
    const shots = await renderSlideCardShots(
      plan.map((s, i) => ({
        questionId: planQuestions[i]?._id ? String(planQuestions[i]._id) : "",
        role: s.role,
        tag: s.tag,
        caption: brandOpts.autoCaptions ? (s.caption || s.narration) : "",
        template: !!templatePaths[templateRole(s.role)],
        templateSize: templateSizes[templateRole(s.role)] || null,
        outPath: shotPaths[i],
      })),
      { siteUrl: brandOpts.siteUrl, landscape }
    ).catch((e) => plan.map(() => ({ error: e?.message || String(e) })));
    // Slides that couldn't be screenshotted fall back to the basic SVG design —
    // report WHICH and WHY (returned to the admin with the video).
    const fallbackSlides = [];
    shots.forEach((r, i) => {
      if (r?.ok) return;
      fallbackSlides.push({ slide: i + 1, role: plan[i].role, tag: plan[i].tag, error: r?.error || "unknown error" });
    });
    if (fallbackSlides.length) {
      console.warn(`[slideshow] ${fallbackSlides.length}/${plan.length} slides use the basic design: ` +
        fallbackSlides.map((f) => `#${f.slide} ${f.error}`).join(" | "));
    }

    const imagePaths = [];
    for (let i = 0; i < plan.length; i++) {
      if (shots[i]?.ok) {
        imagePaths.push(shotPaths[i]);
      } else {
        // Fallback: the lightweight SVG slide (never blocks the video).
        const withTemplate = !!templatePaths[templateRole(plan[i].role)];
        const img = await renderSlideImage(plan[i], { ...brandOpts, transparentBackground: withTemplate });
        const p = path.join(workDir, `slide${String(i).padStart(2, "0")}.${withTemplate ? "png" : "jpg"}`);
        await downloadTo(img.url, p);
        imagePaths.push(p);
      }
      onProgress(SLIDESHOW_STATUS.GENERATING_SLIDES, i + 1, plan.length);
    }

    // 3) Narrate every slide. Split PER SLIDE (never one giant request) so each
    //    slide is timed to its own narration.
    onStatus(SLIDESHOW_STATUS.GENERATING_AUDIO);
    onProgress(SLIDESHOW_STATUS.GENERATING_AUDIO, 0, plan.length);
    const audioPaths = [];
    for (let i = 0; i < plan.length; i++) {
      // A silent slide (e.g. the green reveal with "say" off) gets no audio;
      // the composer fills its time with silence.
      if (!String(plan[i].narration || "").trim()) {
        audioPaths.push(null);
        onProgress(SLIDESHOW_STATUS.GENERATING_AUDIO, i + 1, plan.length);
        continue;
      }
      let result;
      try {
        result = await synthesizeLongSpeech({ text: plan[i].narration, voice, cfg: ttsCfg });
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
    const { duration, segmentDurations = [] } = await composeSlideshowMp4({
      ...(landscape ? { width: 1920, height: 1080, maxTotalSec: Infinity } : {}),
      // Slide 1 stays up for the question time, slide 2 for the answer time —
      // or longer when the narration needs it (the voice is never cut off).
      // The reveal slide shows for its own time; the question slide before it
      // adds the thinking pause AFTER its narration.
      slides: plan.map((s, i) => ({
        imagePath: imagePaths[i],
        audioPath: audioPaths[i],
        minSec: s.role === "reveal" ? s.minSec : s.role === "answer" ? answerSec : questionSec,
        pauseSec: s.pauseSec || 0,
        bgPath: templatePaths[templateRole(s.role)] || null,
      })),
      outPath,
      workDir,
      onProgress: (done, total) => onProgress(SLIDESHOW_STATUS.RENDERING_VIDEO, done, total),
    });
    // Start time of each question in the video (YouTube chapters).
    const chapters = [];
    let at = 0;
    plan.forEach((s, i) => {
      const qi = questions.indexOf(planQuestions[i]);
      if (qi >= 0 && !chapters[qi]) chapters[qi] = { question: qi + 1, startSec: at };
      at += Number(segmentDurations[i]) || 0;
    });

    let uploaded = null;
    let filePath = "";
    if (keepFile) {
      // Move the MP4 out of the temp dir (which is wiped below); the caller
      // uploads it and then deletes it.
      filePath = path.join(os.tmpdir(), `msg-longvideo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
      await fs.rename(outPath, filePath).catch(async () => { await fs.copyFile(outPath, filePath); });
    } else {
      uploaded = await uploadFileToCloudinary(outPath, {
        resourceType: "video",
        folder: "mystudyguide/slideshow/final",
      });
      if (!uploaded?.secure_url) throw new Error("Cloudinary did not return a URL for the slideshow video.");
    }

    onStatus(SLIDESHOW_STATUS.READY);
    const steps = stepMarks.slice(0, -1).map(([st, at], i) => `${st} ${Math.round((stepMarks[i + 1][1] - at) / 1000)}s`);
    console.log(`[slideshow] ${plan.length} slides in ${Math.round((Date.now() - stepMarks[0][1]) / 1000)}s — ${steps.join(", ")}`);
    return {
      videoUrl: uploaded?.secure_url || "",
      filePath, // set when keepFile — the caller must delete it
      chapters: chapters.filter(Boolean),
      slides: plan.length,
      questions: questions.length,
      duration: Math.round(Number(uploaded?.duration) || duration || 0),
      voice,
      provider: ttsCfg.provider,
      ttsNote, // set when the chosen voice's provider was blocked and another was used
      slidePlan: plan.map((s) => ({ id: s.id, tag: s.tag })),
      slidesMode,
      // Slides drawn with the basic design instead of the student view: [{ slide, role, tag, error }].
      fallbackSlides,
    };
  } finally {
    // Always clean up the temp files (images, audio, segments, final MP4).
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
