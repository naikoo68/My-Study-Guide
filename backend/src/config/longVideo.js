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
  isYoutubeConfigured, DEFAULT_YT_LONG_TITLE, applyYtExtras, thumbnailLines, thumbTemplateActive, setYtThumbnail, YT_SHORT_MAX_SEC,
} from "./youtube.js";
import { postLongVideoToFacebookPage } from "./fbLongVideo.js";
import { TTS_PROVIDERS } from "../utils/ttsVoices.js";
import { normalizeReadOptions, readOptionsFromSettings } from "./slidePlan.js";
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
  short: "Uploading the Short",
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
    shortUrl: j.shortUrl || "",
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
// Default title for each video of a repeating long-video schedule.
export const DEFAULT_YT_SERIES_TITLE = "{subject} | {topic} | Part {part} (Questions {range})";

// End time (s) of the first N questions of a video, from its chapter marks —
// used to cut a short teaser. Capped to the YouTube Short limit. Pure.
function firstQuestionsEndSec(chapters, n, totalDur) {
  const ch = (Array.isArray(chapters) ? chapters : []).filter((c) => Number.isFinite(Number(c?.startSec)));
  const next = ch.find((c) => Number(c.question) === n + 1);
  const end = next ? Number(next.startSec) : (Number(totalDur) || YT_SHORT_MAX_SEC);
  return Math.max(5, Math.min(YT_SHORT_MAX_SEC, Math.round(end)));
}
// A short teaser's title (kept within YouTube's 100 chars).
function shortTitle(title) {
  const t = String(title || "Quiz").replace(/\s+/g, " ").trim();
  return `${t} #Shorts`.slice(0, 100);
}
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
//   engine, read — narration engine and what's read aloud (like the AI Slideshow)
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
    // Narration engine for this video (keys/models stay the saved ones). "" = the saved engine.
    engine: TTS_PROVIDERS.includes(o.engine) ? o.engine : "",
    // What the narrator reads aloud (question, options, explanation, key points, quick recall).
    read: o.read && typeof o.read === "object" ? normalizeReadOptions(o.read) : readOptionsFromSettings(site),
    // Part number of a repeating long-video schedule (for the title), 0 = none.
    part: clampInt(o.part, 0, 0, 100000),
    toYoutube: o.toYoutube !== false,
    toFacebook: !!o.toFacebook,
    // Also mark the YouTube upload as a Short (#Shorts) — only honoured when the
    // finished video is <= 3 minutes; skipped with a note otherwise.
    asShort: !!o.asShort,
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
export function queueFullQuizVideo({ source, cfg, site, titleTemplate = "", privacy, publishAt = null, hashtags = "", auto = false, scheduleTitle = "", playlist, useThumbnail = true, options = {}, scheduleId = "" }) {
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
    shortUrl: "",
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
    // A repeating long-video schedule this job belongs to (so we can report the
    // real result back to the schedule row when the video finishes).
    scheduleId: scheduleId ? String(scheduleId) : "",
    part: Number(opts.part) || 0,
    startUsed: opts.order === "random" ? 0 : Number(opts.start) || 1,
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

// When a scheduled long video finishes, write the real outcome back to its
// schedule row so the list shows "posted ✓" (not a forever "being made") and
// counts videos posted. On failure, roll the position back so the next run
// retries this same part. Never throws.
async function reportToSchedule(job, ok) {
  if (!job.scheduleId) return;
  const FbSchedule = (await import("../models/FbSchedule.js")).default;
  const sch = await FbSchedule.findById(job.scheduleId).catch(() => null);
  if (!sch) return;
  const label = job.part ? `Part ${job.part}` : "Video";
  const lv = sch.longVideo || {};
  if (ok) {
    const links = [job.url, job.shortUrl, job.fbUrl].filter(Boolean).join(" · ");
    const extra = (job.notes || []).filter((n) => !/^(YouTube|Facebook) ✓/.test(n));
    sch.lastResult = `${label} posted ✓${links ? ` — ${links}` : ""}${extra.length ? ` · ${extra.join(" · ")}` : ""}`;
    sch.longVideo = { ...lv, postedCount: (Number(lv.postedCount) || 0) + 1 };
  } else {
    sch.lastResult = `${label} failed: ${job.error}`;
    // Retry this part next run (only for in-order schedules).
    if (Number.isInteger(job.startUsed) && job.startUsed > 0) {
      sch.longVideo = { ...lv, nextStart: job.startUsed, part: Math.max(0, (job.part || 1) - 1) };
    }
  }
  sch.markModified?.("longVideo");
  await sch.save().catch(() => {});
}

async function runJob(job, { source, cfg, site, titleTemplate, hashtags, opts }) {
  job.status = "running";
  job.stage = "picking";
  let filePath = "";
  let shortPath = ""; // the vertical Short copy (deleted at the end)
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
    const tpl = (titleTemplate || (opts.part ? DEFAULT_YT_SERIES_TITLE : partial ? DEFAULT_YT_PART_TITLE : DEFAULT_YT_LONG_TITLE))
      .replace(/\{range\}/gi, job.range || `1–${questions.length}`)
      .replace(/\{part\}/gi, String(opts.part || 1));
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
      read: opts.read,
      // 16:9 slide backgrounds (Long videos → Slide templates). Blank = built-in.
      questionTemplateUrl: opts.useTemplates ? site?.longVideoQuestionTemplateUrl || "" : "",
      answerTemplateUrl: opts.useTemplates ? site?.longVideoAnswerTemplateUrl || "" : "",
      // The chosen engine for THIS video (saved keys/models are kept).
      site: opts.engine ? { ...site, ttsProvider: opts.engine } : site,
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
        // Subject | Topic | Quiz of THIS video. The quiz name only when one quiz
        // (or My Quiz) was picked — a whole topic mixes several quizzes.
        lines: thumbnailLines({
          subject: names.subject || source?.label || "",
          topic: names.topic,
          quiz: source?.quiz || source?.testSeries ? names.quiz : "",
          count: questions.length,
          range: job.range,
        }),
        brandColor: site?.brandColor || site?.primaryColor,
      });
      if (r.image) thumbnail = r;
      else job.notes.push(`Thumbnail ✗ (${r.error})`);
    }

    const errors = [];
    let anyOk = false;
    // 1) YouTube — the FULL landscape video (normal).
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
        if (job.publishAt && !up.publishAt) yt.unshift("scheduled time had already passed — published right away");
        job.notes.push(`YouTube ✓${yt.length ? ` (${yt.join(" · ")})` : ""}`);
      } else {
        errors.push(`YouTube: ${up.error}`);
        job.notes.push(`YouTube ✗ (${up.error})`);
      }

      // 2) A SHORT teaser — the FIRST 3 questions only, vertical (9:16), with a
      //    link to the full video in its description. Only if the full upload
      //    succeeded (so we have its link). Best-effort.
      if (opts.asShort && up.ok) {
        job.stage = "short";
        try {
          const cutEnd = firstQuestionsEndSec(result.chapters, 3, job.duration);
          const { makeVerticalShort } = await import("./verticalShort.js");
          shortPath = await makeVerticalShort(filePath, { maxSec: cutEnd });
          const shortDesc = buildYtLongDescription({
            intro: `${Math.min(3, questions.length)} sample questions${breadcrumb ? ` — ${breadcrumb}` : ""}. Watch the full quiz here: ${job.url}`,
            hashtags: tags,
            shorts: true,
          });
          const s = await uploadVideoFileToYoutube({
            filePath: shortPath,
            title: shortTitle(job.title),
            description: shortDesc,
            tags: buildYtTags(tags),
            privacy: job.privacy,
            publishAt: job.publishAt,
          }, cfg);
          if (s.ok) {
            job.shortUrl = s.url;
            if (job.playlist) await applyYtExtras({ videoId: s.id, playlist: job.playlist }, cfg);
            job.notes.push(`Short ✓ (${s.url})`);
          } else {
            job.notes.push(`Short ✗ (${s.error})`);
          }
        } catch (e) {
          job.notes.push(`Short ✗ (${e?.message || e})`);
        }
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
    await reportToSchedule(job, true).catch(() => {});
    if (site?.fbNotifyOnPost === true || job.auto) {
      const links = [job.url, job.shortUrl, job.fbUrl].filter(Boolean);
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
    await reportToSchedule(job, false).catch(() => {});
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
    if (shortPath) await fs.rm(shortPath, { force: true }).catch(() => {});
  }
}


// ---- Repeating long-video schedules (FbSchedule kind "longvideo") ----
//
// Each due time makes the NEXT part of the topic as one long video: with 25
// questions per video, run 1 = questions 1–25 (Part 1), run 2 = 26–50 (Part 2)
// … Random order makes a fresh random video each time. The schedule stores
// its settings in `sch.longVideo` and the position in `nextStart` / `part`.

// The settings kept on a schedule, cleaned (pure, tested). Keeps the
// schedule's position (nextStart / part) when an existing row is re-saved.
export function pickLongVideoScheduleFields(body = {}, prev = null) {
  const lv = body && typeof body === "object" ? body : {};
  const o = normalizeLongVideoOptions(lv.options || {}, {});
  const pl = lv.playlist && typeof lv.playlist === "object" ? lv.playlist : null;
  const plId = /^[A-Za-z0-9_-]{10,64}$/.test(String(pl?.id || "")) ? String(pl.id) : "";
  return {
    options: { ...o, part: 0, start: 1 },
    title: String(lv.title || "").replace(/[<>]/g, "").trim().slice(0, 100),
    privacy: ["public", "unlisted", "private"].includes(lv.privacy) ? lv.privacy : "public",
    // "" = the default long-video playlist, "__none__" = none, else a playlist id.
    playlist: lv.playlist === "__none__" || pl?.id === "__none__" ? "__none__" : plId ? { id: plId, title: String(pl.title || "").slice(0, 150) } : "",
    useThumbnail: lv.useThumbnail !== false,
    nextStart: clampInt(lv.nextStart ?? prev?.nextStart, 1, 1, 1000000),
    part: clampInt(lv.part ?? prev?.part, 0, 0, 100000),
  };
}

// Which questions the NEXT run of a schedule covers (pure, tested).
// → { start, count, part, last, wrapped } or { done: true } when every part is made.
export function nextLongVideoPart({ nextStart = 1, part = 0, perVideo = 0, total = 0, order = "sequential", stopWhenExhausted = true } = {}) {
  const per = Math.max(1, Math.min(MAX_LONG_VIDEO_QUESTIONS, Number(perVideo) || MAX_LONG_VIDEO_QUESTIONS));
  if (order === "random") return { start: 1, count: per, part: part + 1, last: false, wrapped: false };
  if (!(total > 0)) return { done: true };
  let start = Math.max(1, Number(nextStart) || 1);
  let wrapped = false;
  if (start > total) {
    if (stopWhenExhausted) return { done: true };
    start = 1; wrapped = true; // repeat from the beginning
  }
  const end = Math.min(total, start + per - 1);
  return { start, count: end - start + 1, part: wrapped ? 1 : part + 1, last: end >= total, wrapped };
}

// Run one slot of a long-video schedule: queue the next part (made in the
// background). Mutates `sch` bookkeeping (the caller saves it).
// Returns { ok, error?, completed? } like runScheduleOnce.
export async function runLongVideoSchedule(sch, cfg, site) {
  const lv = sch.longVideo || {};
  const o = lv.options || {};
  const total = (await completeQuestionsForSource(sch.source || {}).catch(() => [])).length;
  const stop = sch.stopWhenExhausted !== false;
  const next = nextLongVideoPart({ nextStart: lv.nextStart, part: lv.part, perVideo: o.count, total, order: o.order, stopWhenExhausted: stop });
  sch.lastRunAt = new Date();
  if (next.done) {
    sch.lastResult = total ? `Completed — every part of the ${total} questions has been made.` : "No complete questions in this content.";
    return { ok: !!total, completed: !!total, exhausted: true, error: total ? undefined : sch.lastResult };
  }
  const playlist = lv.playlist === "__none__" ? null : lv.playlist?.id ? lv.playlist : undefined;
  // Post to whichever chosen network is connected right now; say which was skipped.
  const ytOk = !!o.toYoutube && isYoutubeConfigured(cfg);
  const fbOk = !!o.toFacebook && isFacebookConfigured(cfg);
  const skipped = [o.toYoutube && !ytOk && "YouTube", o.toFacebook && !fbOk && "Facebook"].filter(Boolean);
  if (!ytOk && !fbOk) {
    sch.lastResult = `Error: ${skipped.join(" and ") || "No network"} not connected.`;
    return { ok: false, error: sch.lastResult };
  }
  try {
    queueFullQuizVideo({
      source: sch.source,
      cfg,
      site,
      titleTemplate: lv.title || "",
      privacy: lv.privacy,
      hashtags: sch.hashtags || "",
      auto: true,
      scheduleTitle: sch.title || "",
      playlist,
      useThumbnail: lv.useThumbnail !== false,
      options: { ...o, toYoutube: ytOk, toFacebook: fbOk, start: next.start, count: next.count, part: o.order === "random" ? 0 : next.part },
      scheduleId: sch._id,
    });
  } catch (e) {
    sch.lastResult = `Error: ${e?.message || e}`;
    return { ok: false, error: sch.lastResult };
  }
  sch.longVideo = { ...lv, nextStart: next.start + next.count, part: next.part };
  sch.markModified?.("longVideo");
  const range = o.order === "random" ? `${next.count} random questions` : `questions ${next.start}–${next.start + next.count - 1} of ${total}`;
  sch.lastResult = `${o.order === "random" ? "Video" : `Part ${next.part}`} (${range}) is being made — you'll get an email when it's posted.${next.wrapped ? " (started again from question 1)" : ""}${skipped.length ? ` ${skipped.join(" and ")} skipped (not connected).` : ""}`;
  return { ok: true, completed: stop && next.last && o.order !== "random" };
}
