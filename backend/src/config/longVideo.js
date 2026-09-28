// Full-topic LONG YouTube video: every question of a source (in order) as ONE
// narrated 16:9 video — question → answer for each, with YouTube chapters —
// uploaded to the connected channel as a normal (non-Short) video.
//
// Rendering 25–50 questions takes minutes and is CPU/RAM heavy (Chromium +
// ffmpeg), so jobs run in the BACKGROUND, ONE AT A TIME, and never inside the
// scheduler tick. Status lives in memory (lost on a server restart — the admin
// is emailed on success/failure, and can simply start it again).
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { tenantStore, getCurrentTenantId } from "../utils/tenantContext.js";
import { generateSlideshow } from "./slideshow.js";
import {
  uploadVideoFileToYoutube, buildYtTitle, buildYtLongDescription, buildYtTags,
  isYoutubeConfigured, DEFAULT_YT_LONG_TITLE,
} from "./youtube.js";
import {
  pickAllQuestionsForSource, titlePartsForQuestion, breadcrumbForQuestion,
  hashtagsForQuestion, fbNotify,
} from "./facebook.js";

export const MAX_LONG_VIDEO_QUESTIONS = 50;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const jobs = new Map(); // id → job
let chain = Promise.resolve(); // one render at a time

const STAGE_LABEL = {
  queued: "Waiting for another video to finish",
  picking: "Loading questions",
  pending: "Starting",
  generating_slides: "Drawing slides",
  generating_audio: "Recording narration",
  rendering_video: "Rendering video",
  ready: "Video ready",
  uploading: "Uploading to YouTube",
  done: "Done",
  failed: "Failed",
};

function cleanup() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
}

// Public view of a job (no internals).
export function publicJob(j) {
  if (!j) return null;
  return {
    id: j.id,
    status: j.status, // queued | running | done | failed
    stage: j.stage,
    stageLabel: STAGE_LABEL[j.stage] || j.stage,
    progress: j.progress,
    label: j.label,
    title: j.title,
    questions: j.questions,
    duration: j.duration,
    url: j.url,
    videoId: j.videoId,
    privacy: j.privacy,
    publishAt: j.publishAt,
    error: j.error,
    auto: j.auto,
    createdAt: j.createdAt,
    finishedAt: j.finishedAt,
  };
}

export function getLongVideoJob(id, tenantKey) {
  const j = jobs.get(String(id));
  if (!j || j.tenantKey !== tenantKey) return null;
  return j;
}

export function listLongVideoJobs(tenantKey, limit = 10) {
  cleanup();
  return [...jobs.values()].filter((j) => j.tenantKey === tenantKey)
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(publicJob);
}

export const tenantKeyNow = () => String(getCurrentTenantId() || "");

// Queue a full-topic video. Returns the job (public view).
//   source      — { subject, session, quiz, testSeries, label }
//   cfg, site   — the tenant's getFacebookConfig() + its Settings doc
//   titleTemplate, privacy, publishAt, hashtags — optional overrides
//   auto        — true when triggered after a Shorts schedule finished
export function queueFullQuizVideo({ source, cfg, site, titleTemplate = "", privacy, publishAt = null, hashtags = "", auto = false, scheduleTitle = "" }) {
  cleanup();
  if (!isYoutubeConfigured(cfg)) throw new Error("Connect YouTube first (Admin → Facebook → YouTube Shorts).");
  const job = {
    id: randomUUID(),
    tenantKey: tenantKeyNow(),
    status: "queued",
    stage: "queued",
    progress: null,
    label: source?.label || scheduleTitle || "",
    title: "",
    questions: 0,
    duration: 0,
    url: "",
    videoId: "",
    privacy: privacy || cfg.ytPrivacy || "public",
    publishAt: publishAt || null,
    error: "",
    auto,
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  // Keep the caller's tenant context for the background run.
  const store = tenantStore.getStore();
  const run = () => (store ? tenantStore.run(store, () => runJob(job, { source, cfg, site, titleTemplate, hashtags })) : runJob(job, { source, cfg, site, titleTemplate, hashtags }));
  chain = chain.then(run, run).catch(() => {});
  return publicJob(job);
}

async function runJob(job, { source, cfg, site, titleTemplate, hashtags }) {
  job.status = "running";
  job.stage = "picking";
  let filePath = "";
  try {
    const questions = await pickAllQuestionsForSource(source, { max: MAX_LONG_VIDEO_QUESTIONS });
    if (!questions.length) throw new Error("No complete questions found in this source.");
    job.questions = questions.length;

    const names = await titlePartsForQuestion(questions[0]);
    const breadcrumb = await breadcrumbForQuestion(questions[0]);
    job.title = buildYtTitle(titleTemplate || DEFAULT_YT_LONG_TITLE, {
      subject: names.subject || names.quiz || source?.label || "",
      topic: names.topic,
      quiz: names.quiz,
      count: questions.length,
    }, source?.label || "Full Quiz");

    const siteUrl = (cfg.siteUrl || "https://www.mystudyguide.in").replace(/\/+$/, "");
    const result = await generateSlideshow(questions, {
      orientation: "landscape",
      keepFile: true,
      voice: site?.slideshowVoice,
      autoCaptions: site?.slideshowAutoCaptions !== false,
      questionSec: site?.slideshowQuestionSec,
      answerSec: site?.slideshowAnswerSec,
      // A long video always shows each answer after its question.
      slidesMode: "both",
      site,
      brandColor: site?.brandColor || site?.primaryColor || "#2563eb",
      siteName: site?.siteName || "My Study Guide",
      siteUrl: siteUrl.replace(/^https?:\/\//, ""),
      subjectName: breadcrumb || "",
      onStatus: (st) => { job.stage = String(st || "").toLowerCase(); },
      onProgress: (stage, done, total) => { job.stage = String(stage || "").toLowerCase(); job.progress = { done, total }; },
    });
    filePath = result.filePath;
    job.duration = result.duration;
    if (!filePath) throw new Error("The video file was not produced.");

    const tags = await hashtagsForQuestion(questions[0], site, hashtags);
    const description = buildYtLongDescription({
      intro: `${questions.length} questions with answers${breadcrumb ? ` — ${breadcrumb}` : ""}.`,
      chapters: (result.chapters || []).map((c) => ({ ...c, label: `Question ${c.question}` })),
      hashtags: tags,
      siteUrl,
    });

    job.stage = "uploading";
    job.progress = { done: 0, total: 100 };
    const up = await uploadVideoFileToYoutube({
      filePath,
      title: job.title,
      description,
      tags: buildYtTags(tags),
      privacy: job.privacy,
      publishAt: job.publishAt,
      onProgress: (sent, size) => { job.progress = { done: Math.round((sent / size) * 100), total: 100 }; },
    }, cfg);
    if (!up.ok) throw new Error(up.error);
    job.url = up.url;
    job.videoId = up.id;
    job.privacy = up.privacy || job.privacy;
    job.status = "done";
    job.stage = "done";
    job.finishedAt = Date.now();
    if (site?.fbNotifyOnPost === true || job.auto) {
      await fbNotify({
        site,
        subject: `🎬 YouTube video uploaded — ${job.title}`,
        text: `Uploaded "${job.title}" (${job.questions} questions, ${Math.round(job.duration / 60)} min): ${job.url}`,
        html: `<p>🎬 Uploaded <b>${job.title}</b> (${job.questions} questions, about ${Math.round(job.duration / 60)} min).</p><p><a href="${job.url}">${job.url}</a></p>`,
      }).catch(() => {});
    }
  } catch (e) {
    job.status = "failed";
    job.stage = "failed";
    job.error = String(e?.message || e).slice(0, 500);
    job.finishedAt = Date.now();
    if (site?.fbNotifyOnError !== false) {
      await fbNotify({
        site,
        subject: `⚠️ YouTube long video failed — ${job.label || job.title || "full quiz"}`,
        text: `Could not make/upload the full quiz video. ${job.error}`,
        html: `<p>⚠️ Could not make/upload the full quiz video for <b>${job.label || job.title}</b>.</p><p>${job.error}</p>`,
      }).catch(() => {});
    }
  } finally {
    if (filePath) await fs.rm(filePath, { force: true }).catch(() => {});
  }
}
