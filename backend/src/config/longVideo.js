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
  isYoutubeConfigured, DEFAULT_YT_LONG_TITLE, applyYtExtras, thumbnailLines, thumbTemplateActive, setYtThumbnail,
} from "./youtube.js";
import { postLongVideoToFacebookPage } from "./fbLongVideo.js";
import {
  pickAllQuestionsForSource, completeQuestionsForSource, titlePartsForQuestion, breadcrumbForQuestion,
  hashtagsForQuestion, fbNotify, isFacebookConfigured,
} from "./facebook.js";

export const MAX_LONG_VIDEO_QUESTIONS = 50;
const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  uploading_facebook: "Uploading to Facebook",
  finishing: "Setting thumbnail & playlist",
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
    fbUrl: j.fbUrl || "",
    toYoutube: j.toYoutube !== false,
    toFacebook: !!j.toFacebook,
    range: j.range || "",
    privacy: j.privacy,
    publishAt: j.publishAt,
    error: j.error,
    notes: j.notes || [],
    playlistTitle: j.playlist?.title || "",
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

// Default title when only PART of a topic is in the video ("Questions 26–50").
export const DEFAULT_YT_PART_TITLE = "{subject} | {topic} | Questions {range}";

const clampInt = (v, def, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};

// The per-video settings from a request / schedule, cleaned (pure, tested).
// Anything not given falls back to the saved AI Slideshow settings (`site`).
//   count        — questions in the video (0 / blank = all, up to the max)
//   start        — start from question N (Sequential only)
//   order        — "sequential" | "random"
//   voice, slidesMode, reveal, questionSec, answerSec, autoCaptions — narration & slides
//   useTemplates — false = built-in slide design even when 16:9 templates are saved
//   toYoutube, toFacebook — where to post
export function normalizeLongVideoOptions(o = {}, site = {}) {
  const order = o.order === "random" ? "random" : "sequential";
  const slidesMode = (o.slidesMode ?? site?.slideshowSlides) === "question" ? "question" : "both";
  const r = o.reveal && typeof o.reveal === "object" ? o.reveal : {};
  return {
    count: clampInt(o.count, 0, 0, MAX_LONG_VIDEO_QUESTIONS) || 0,
    start: order === "random" ? 1 : clampInt(o.start, 1, 1, 100000),
    order,
    voice: String(o.voice || site?.slideshowVoice || "").trim().slice(0, 120),
    slidesMode,
    reveal: {
      pauseSec: clampInt(r.pauseSec ?? site?.slideshowRevealPauseSec, 3, 0, 15),
      showSec: clampInt(r.showSec ?? site?.slideshowRevealSec, 3, 1, 15),
      say: (r.say ?? site?.slideshowRevealSay) !== false,
    },
    questionSec: clampInt(o.questionSec ?? site?.slideshowQuestionSec, 10, 3, 40),
    answerSec: clampInt(o.answerSec ?? site?.slideshowAnswerSec, 8, 3, 40),
    autoCaptions: (o.autoCaptions ?? site?.slideshowAutoCaptions) !== false,
    useTemplates: o.useTemplates !== false, // use the saved 16:9 slide templates (if any)
    toYoutube: o.toYoutube !== false,
    toFacebook: !!o.toFacebook,
  };
}

// Queue a full-topic video. Returns the job (public view).
//   source      — { subject, session, quiz, testSeries, label }
//   cfg, site   — the tenant's getFacebookConfig() + its Settings doc
//   titleTemplate, privacy, publishAt, hashtags — optional overrides
//   auto        — true when triggered after a Shorts schedule finished
//   playlist    — { id, title } to add the video to; undefined = the default
//                 long-video playlist from the YouTube settings; null = none
//   useThumbnail — false skips the thumbnail template (default: use it when set)
//   options     — see normalizeLongVideoOptions (questions, narration, destinations)
export function queueFullQuizVideo({ source, cfg, site, titleTemplate = "", privacy, publishAt = null, hashtags = "", auto = false, scheduleTitle = "", playlist, useThumbnail = true, options = {} }) {
  cleanup();
  const opts = normalizeLongVideoOptions(options, site);
  if (!opts.toYoutube && !opts.toFacebook) throw new Error("Choose where to post the video (YouTube and/or Facebook).");
  if (opts.toYoutube && !isYoutubeConfigured(cfg)) throw new Error("Connect YouTube first (YouTube Shorts card) — or untick YouTube.");
  if (opts.toFacebook && !isFacebookConfigured(cfg)) throw new Error("Connect your Facebook Page first — or untick Facebook.");
  const job = {
    id: randomUUID(),
    tenantKey: tenantKeyNow(),
    status: "queued",
    stage: "queued",
    progress: null,
    label: source?.label || scheduleTitle || "",
    title: "",
    questions: 0,
    range: "",
    duration: 0,
    url: "",
    videoId: "",
    fbUrl: "",
    toYoutube: opts.toYoutube,
    toFacebook: opts.toFacebook,
    privacy: privacy || cfg.ytPrivacy || "public",
    publishAt: publishAt || null,
    error: "",
    notes: [],
    playlist: playlist === undefined
      ? (cfg.ytLongPlaylistId ? { id: cfg.ytLongPlaylistId, title: cfg.ytLongPlaylistTitle || "" } : null)
      : (playlist?.id ? playlist : null),
    useThumbnail: useThumbnail !== false && thumbTemplateActive(cfg.ytThumb),
    auto,
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  // Keep the caller's tenant context for the background run.
  const store = tenantStore.getStore();
  const args = { source, cfg, site, titleTemplate, hashtags, opts };
  const run = () => (store ? tenantStore.run(store, () => runJob(job, args)) : runJob(job, args));
  chain = chain.then(run, run).catch(() => {});
  return publicJob(job);
}

async function runJob(job, { source, cfg, site, titleTemplate, hashtags, opts }) {
  job.status = "running";
  job.stage = "picking";
  let filePath = "";
  try {
    const all = await completeQuestionsForSource(source);
    const max = opts.count || MAX_LONG_VIDEO_QUESTIONS;
    const questions = source?.question
      ? await pickAllQuestionsForSource(source, { max: 1 })
      : await pickAllQuestionsForSource(source, { max, start: opts.start, order: opts.order });
    if (!questions.length) {
      throw new Error(opts.start > 1 && all.length
        ? `This content has only ${all.length} complete questions — "start from question ${opts.start}" is past the end.`
        : "No complete questions found in this source.");
    }
    job.questions = questions.length;
    const first = opts.order === "random" ? 1 : opts.start;
    const last = first + questions.length - 1;
    // Only part of the topic (not every question) → say which part.
    const partial = opts.order !== "random" && (first > 1 || last < all.length);
    job.range = partial ? `${first}–${last}` : "";
    if (!opts.count && all.length > MAX_LONG_VIDEO_QUESTIONS && opts.order !== "random") {
      job.notes.push(`This content has ${all.length} questions — the video has questions ${first}–${last} (max ${MAX_LONG_VIDEO_QUESTIONS} per video; use "Start from" for the next part)`);
    }

    const names = await titlePartsForQuestion(questions[0]);
    const breadcrumb = await breadcrumbForQuestion(questions[0]);
    const tpl = (titleTemplate || (partial ? DEFAULT_YT_PART_TITLE : DEFAULT_YT_LONG_TITLE)).replace(/\{range\}/gi, job.range || `1–${questions.length}`);
    job.title = buildYtTitle(tpl, {
      subject: names.subject || names.quiz || source?.label || "",
      topic: names.topic,
      quiz: names.quiz,
      count: questions.length,
    }, source?.label || "Full Quiz");

    const siteUrl = (cfg.siteUrl || "https://www.mystudyguide.in").replace(/\/+$/, "");
    const result = await generateSlideshow(questions, {
      orientation: "landscape",
      keepFile: true,
      voice: opts.voice || site?.slideshowVoice,
      autoCaptions: opts.autoCaptions,
      questionSec: opts.questionSec,
      answerSec: opts.answerSec,
      slidesMode: opts.slidesMode,
      reveal: opts.reveal,
      // 16:9 slide backgrounds (Long videos → Slide templates). Blank = built-in.
      questionTemplateUrl: opts.useTemplates ? site?.longVideoQuestionTemplateUrl || "" : "",
      answerTemplateUrl: opts.useTemplates ? site?.longVideoAnswerTemplateUrl || "" : "",
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
    if (result.ttsNote) job.notes.push(result.ttsNote);

    const tags = await hashtagsForQuestion(questions[0], site, hashtags);
    const offset = opts.order === "random" ? 0 : first - 1;
    const description = buildYtLongDescription({
      intro: `${questions.length} questions with answers${job.range ? ` (questions ${job.range})` : ""}${breadcrumb ? ` — ${breadcrumb}` : ""}.`,
      chapters: (result.chapters || []).map((c) => ({ ...c, label: `Question ${offset + c.question}` })),
      hashtags: tags,
      siteUrl,
    });

    // Template thumbnail — drawn ONCE, used by YouTube and Facebook.
    let thumbnail = null;
    if (job.useThumbnail) {
      job.stage = "finishing";
      const { renderYoutubeThumbnail } = await import("./ytThumbnail.js");
      const r = await renderYoutubeThumbnail({
        ...cfg.ytThumb,
        lines: thumbnailLines({ subject: names.subject || names.quiz || source?.label || "", topic: names.topic, count: questions.length }),
        brandColor: site?.brandColor || site?.primaryColor,
      });
      if (r.image) thumbnail = r;
      else job.notes.push(`Thumbnail ✗ (${r.error})`);
    }

    const errors = [];
    let anyOk = false;
    // 1) YouTube
    if (opts.toYoutube) {
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
      if (up.ok) {
        anyOk = true;
        job.url = up.url;
        job.videoId = up.id;
        job.privacy = up.privacy || job.privacy;
        const yt = [];
        if (thumbnail) {
          const t = await setYtThumbnail({ videoId: up.id, image: thumbnail.image, mime: thumbnail.mime }, cfg);
          yt.push(t.ok ? "Thumbnail ✓" : `Thumbnail ✗ (${t.error})`);
        }
        if (job.playlist) yt.push(...(await applyYtExtras({ videoId: up.id, playlist: job.playlist }, cfg)));
        // The render took longer than the gap to the scheduled time → YouTube got
        // it without a schedule (published right away). Say so instead of hiding it.
        if (job.publishAt && !up.publishAt) yt.unshift("scheduled time had already passed — published right away");
        job.notes.push(`YouTube ✓${yt.length ? ` (${yt.join(" · ")})` : ""}`);
      } else {
        errors.push(`YouTube: ${up.error}`);
        job.notes.push(`YouTube ✗ (${up.error})`);
      }
    }
    // 2) Facebook Page (normal video)
    if (opts.toFacebook) {
      job.stage = "uploading_facebook";
      job.progress = null;
      const fb = await postLongVideoToFacebookPage({ filePath, title: job.title, description, publishAt: job.publishAt, thumbnail }, cfg);
      if (fb.ok) {
        anyOk = true;
        job.fbUrl = fb.url;
        job.notes.push(`Facebook ✓${fb.scheduled ? " (scheduled)" : ""}${fb.late ? " (scheduled time was too close — published right away)" : ""}`);
      } else {
        errors.push(`Facebook: ${fb.error}`);
        job.notes.push(`Facebook ✗ (${fb.error})`);
      }
    }
    if (!anyOk) throw new Error(errors.join(" · ") || "Nothing was uploaded.");

    job.status = "done";
    job.stage = "done";
    job.finishedAt = Date.now();
    if (site?.fbNotifyOnPost === true || job.auto) {
      const links = [job.url, job.fbUrl].filter(Boolean);
      await fbNotify({
        site,
        subject: `🎬 Long video posted — ${job.title}`,
        text: `Posted "${job.title}" (${job.questions} questions, ${Math.round(job.duration / 60)} min):\n${links.join("\n")}\n${job.notes.join(" · ")}`,
        html: `<p>🎬 Posted <b>${escHtml(job.title)}</b> (${job.questions} questions, about ${Math.round(job.duration / 60)} min).</p>${links.map((u) => `<p><a href="${escHtml(u)}">${escHtml(u)}</a></p>`).join("")}<p>${escHtml(job.notes.join(" · "))}</p>`,
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
        subject: `⚠️ Long video failed — ${job.label || job.title || "full quiz"}`,
        text: `Could not make/upload the full quiz video. ${job.error}`,
        html: `<p>⚠️ Could not make/upload the full quiz video for <b>${escHtml(job.label || job.title)}</b>.</p><p>${escHtml(job.error)}</p>`,
      }).catch(() => {});
    }
  } finally {
    if (filePath) await fs.rm(filePath, { force: true }).catch(() => {});
  }
}
