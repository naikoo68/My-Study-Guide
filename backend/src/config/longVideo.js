// Full-topic LONG YouTube video: every question of a source (in order) as ONE
// narrated 16:9 video — question → answer for each, with YouTube chapters —
// uploaded to the connected channel as a normal (non-Short) video.
//
// Rendering 25–50 questions takes minutes and is CPU/RAM heavy (Chromium +
// ffmpeg), so jobs run in the BACKGROUND, ONE AT A TIME, and never inside the
// scheduler tick. Status lives in memory (lost on a server restart — the admin
// is emailed on success/failure, and can simply start it again).
import { formatSocialLinks } from "../utils/socialLinks.js";
import { slideshowBrandOpts } from "../utils/videoBrand.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { tenantStore, getCurrentTenantId } from "../utils/tenantContext.js";
import { activeSocialProfileId } from "../utils/socialProfile.js";
import { generateSlideshow } from "./slideshow.js";
import {
  uploadVideoFileToYoutube, buildYtTitle, buildYtLongDescription, buildYtTags,
  isYoutubeConfigured, commentOnYoutubeVideo, DEFAULT_YT_LONG_TITLE, DEFAULT_YT_LONG_TITLE_NOQUIZ, applyYtExtras, thumbnailLines, thumbTemplateActive, setYtThumbnail, slideTextConfigFromSite,
} from "./youtube.js";
import { postLongVideoToFacebookPage } from "./fbLongVideo.js";
import { TTS_PROVIDERS } from "../utils/ttsVoices.js";
import { customVideoText, withVideoText } from "../utils/videoDescription.js";
import { displayTrail, displayName } from "../utils/displayName.js";
import { normalizeReadOptions, readOptionsFromSettings } from "./slidePlan.js";
import {
  pickAllQuestionsForSource, completeQuestionsForSource, titlePartsForQuestion, breadcrumbForQuestion,
  hashtagsForQuestion, fbNotify, isFacebookConfigured,
  postReelToFacebookPage, postReelToInstagram, commentOnFacebookPost, commentOnInstagramMedia, linkInBioOf,
} from "./facebook.js";

export const MAX_LONG_VIDEO_QUESTIONS = 50;
const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const jobs = new Map(); // id → job
// ---- Render lanes: each account renders independently ----
// Every account (your own Social Media Auto Posting, and each cross-posting
// user) has its OWN lane: its videos are made one after another, but never
// wait behind another account's video — two accounts scheduled for the same
// time render side by side. A server-wide cap (LONG_VIDEO_PARALLEL, default 2)
// limits how many videos render at once so a small VM doesn't run out of RAM;
// only beyond that cap does an account wait (shown as "server busy").
const lanes = new Map(); // laneKey → promise of the lane's last job
export const laneKeyOf = (j) => `${j?.tenantKey || ""}|${j?.profileId || ""}`;
export function maxParallelRenders() {
  const n = parseInt(process.env.LONG_VIDEO_PARALLEL || "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 8) : 2;
}
let rendering = 0;
const slotWaiters = [];
function acquireSlot(job) {
  if (rendering < maxParallelRenders()) { rendering += 1; return Promise.resolve(); }
  if (job && job.status === "queued") job.stage = "waiting_slot";
  return new Promise((resolve) => slotWaiters.push(resolve));
}
function releaseSlot() {
  const next = slotWaiters.shift();
  if (next) next(); // hand the slot straight to the next waiting lane
  else rendering = Math.max(0, rendering - 1);
}
// Add `run` to its account's lane. A stopped job is skipped without taking a slot.
function enqueue(job, run) {
  const key = laneKeyOf(job);
  const prev = lanes.get(key) || Promise.resolve();
  const turn = async () => {
    if (job.status === "cancelled") return;
    await acquireSlot(job);
    try {
      if (job.status !== "cancelled") await run();
    } finally { releaseSlot(); }
  };
  const p = prev.then(turn, turn).catch(() => {});
  lanes.set(key, p);
  p.then(() => { if (lanes.get(key) === p) lanes.delete(key); });
}

const STAGE_LABEL = {
  queued: "Waiting for this account's previous video to finish",
  waiting_slot: "Waiting — the server is busy with other accounts' videos",
  picking: "Loading questions",
  pending: "Starting",
  generating_slides: "Drawing slides",
  generating_audio: "Recording narration",
  rendering_video: "Rendering video",
  ready: "Video ready",
  uploading: "Uploading to YouTube",
  uploading_facebook: "Uploading to Facebook",
  short: "Uploading the Short",
  reels: "Posting the Facebook / Instagram Reels",
  uploading_preview: "Saving the preview videos",
  downloading_preview: "Getting the previewed video",
  finishing: "Setting thumbnail & playlist",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled — its schedule was deleted",
  stopped: "Stopped by you",
};

function cleanup() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
}

// Public view of a job (no internals).
// Overall progress (0–100) across a job's stages, so the UI can show a % and a
// time-left estimate (like the AI Slideshow test). Each stage owns a slice of
// the bar; within a stage we use its done/total. Pure.
const STAGE_PCT = {
  queued: [0, 2], waiting_slot: [0, 2], picking: [2, 3], pending: [2, 3],
  generating_slides: [5, 35], generating_audio: [40, 15],
  rendering_video: [55, 28], ready: [83, 2], finishing: [85, 3],
  uploading: [88, 7], short: [95, 2], uploading_facebook: [97, 1], reels: [98, 1.9],
  done: [100, 0], failed: [0, 0], cancelled: [0, 0],
};
// A preview being published has nothing to render — only download + uploads.
const PUBLISH_PCT = {
  queued: [0, 1], picking: [1, 1], downloading_preview: [2, 10],
  uploading: [12, 60], short: [72, 12], uploading_facebook: [84, 6], reels: [90, 9],
  done: [100, 0], failed: [0, 0],
};
export function jobPercent(j) {
  if (!j) return 0;
  if (j.status === "done") return 100;
  const [base, span] = (j.fromPreview ? PUBLISH_PCT : STAGE_PCT)[j.stage] || [0, 0];
  let frac = 0;
  if (j.progress && j.progress.total > 0) frac = Math.max(0, Math.min(1, j.progress.done / j.progress.total));
  return Math.max(0, Math.min(99, Math.round(base + span * frac)));
}

export function publicJob(j) {
  if (!j) return null;
  return {
    id: j.id,
    status: j.status, // queued | running | done | failed
    stage: j.stage,
    stageLabel: j.stage === "cancelled" && j.cancelReason === "stopped" ? STAGE_LABEL.stopped : STAGE_LABEL[j.stage] || j.stage,
    progress: j.progress,
    percent: jobPercent(j),
    label: j.label,
    title: j.title,
    questions: j.questions,
    duration: j.duration,
    url: j.url,
    videoId: j.videoId,
    fbUrl: j.fbUrl || "",
    shortUrl: j.shortUrl || "",
    fbReelUrl: j.fbReelUrl || "",
    toYoutube: j.toYoutube !== false,
    toFacebook: !!j.toFacebook,
    range: j.range || "",
    privacy: j.privacy,
    publishAt: j.publishAt,
    error: j.error,
    notes: j.notes || [],
    playlistTitle: j.playlist?.title || "",
    auto: j.auto,
    profileId: j.profileId || "",
    scheduleId: j.scheduleId || "", // lets the Scheduled posts list show this video's progress on its row
    createdAt: j.createdAt,
    finishedAt: j.finishedAt,
  };
}

// The video a schedule is making RIGHT NOW (queued / running), for the live
// progress box on its row. Looked up by schedule id — NOT by tenant key: the
// scheduler stamps jobs with the schedule's own tenant id (null or the default
// tenant for the platform), which can differ from the admin request's, so a
// tenant-key filter hid scheduled videos. The caller only passes ids of
// schedules the admin can already see (tenant-scoped query), so this is safe.
export function activeJobsForSchedules(scheduleIds = []) {
  const want = new Set((scheduleIds || []).map(String));
  const out = {};
  for (const j of jobs.values()) {
    if (j.preview || !j.scheduleId || !want.has(String(j.scheduleId))) continue;
    if (j.status !== "queued" && j.status !== "running") continue;
    const prev = out[j.scheduleId];
    if (!prev || (j.createdAt || 0) > (prev.createdAt || 0)) out[j.scheduleId] = publicJob(j);
  }
  return out;
}

// ---- Deleted schedules must not keep posting ----
// A schedule's video is made in the background queue and can take 20+ minutes
// (and wait behind other videos). Deleting the schedule used to leave its
// queued / half-made video running, so it was still uploaded afterwards. Now:
// deleting marks its jobs cancelled at once, and every job re-checks that its
// schedule still exists before it starts and again right before uploading.
const CANCELLED = "__schedule_deleted__";
export function cancelJobsForSchedules(scheduleIds = []) {
  const ids = new Set((scheduleIds || []).map(String));
  let n = 0;
  for (const j of jobs.values()) {
    if (j.preview || !j.scheduleId || !ids.has(String(j.scheduleId))) continue;
    if (j.status !== "queued" && j.status !== "running") continue;
    j.cancelRequested = true; n += 1;
  }
  return n;
}
async function scheduleGone(job) {
  if (job.cancelRequested) return true;
  if (!job.scheduleId) return false;
  try {
    const FbSchedule = (await import("../models/FbSchedule.js")).default;
    const { runUnscoped } = await import("../utils/tenantContext.js");
    return !(await runUnscoped(() => FbSchedule.exists({ _id: job.scheduleId })));
  } catch {
    return false; // a database hiccup never cancels a video
  }
}
const stopMessage = (job) => (job.cancelReason === "stopped"
  ? "Stopped by you — nothing was posted."
  : "Its schedule was deleted, so this video was not posted.");
async function stopIfScheduleGone(job) {
  if (await scheduleGone(job)) throw Object.assign(new Error(stopMessage(job)), { code: CANCELLED });
}
// Checked on every progress tick while a video renders, so "Stop" takes effect
// within seconds (between slides / narration parts / video segments) instead of
// after a 20-minute render.
function throwIfStopped(job) {
  if (job.cancelRequested) throw Object.assign(new Error(stopMessage(job)), { code: CANCELLED });
}
function markCancelled(job, e) {
  job.status = "cancelled";
  job.stage = "cancelled";
  job.error = e.message;
  job.finishedAt = Date.now();
}

export function getLongVideoJob(id, tenantKey) {
  const j = jobs.get(String(id));
  if (!j || j.tenantKey !== tenantKey) return null;
  return j;
}

// ---- The render queue (one video at a time, for every account) ----
// What is being made right now and what is waiting behind it, in order — so a
// "Waiting for another video to finish" row can say WHICH video, and the admin
// can stop it. Raw jobs; the controller decides what each admin may see.
const UPLOAD_STAGES = new Set(["uploading", "uploading_facebook", "short", "reels"]);
const jobKind = (j) => (j.preview ? "preview" : j.fromPreview ? "publish" : "video");
export function renderQueue() {
  cleanup();
  const live = [...jobs.values()].filter((j) => j.status === "queued" || j.status === "running");
  // Each lane runs its jobs in the order they were added (= createdAt).
  live.sort((a, b) => (a.status === "running" ? -1 : 0) - (b.status === "running" ? -1 : 0) || (a.createdAt || 0) - (b.createdAt || 0));
  return live;
}
// Position of each job within ITS OWN account's lane (0 = being made now).
export function lanePositions(list) {
  const seen = new Map();
  const out = new Map();
  for (const j of list) {
    const k = laneKeyOf(j);
    const n = seen.get(k) || 0;
    out.set(j.id, n);
    seen.set(k, n + 1);
  }
  return out;
}
// Why a job can't be stopped right now ("" = it can).
export function stopBlockedReason(j) {
  if (!j || (j.status !== "queued" && j.status !== "running")) return "It has already finished.";
  if (j.status === "running" && (j.uploadStarted || UPLOAD_STAGES.has(j.stage))) {
    return "It is already uploading — stopping now could leave it half-posted, so it will finish (about a minute).";
  }
  return "";
}
export function queueView(j, position = 0) {
  const kind = jobKind(j);
  return {
    id: j.id,
    kind, // video | preview | publish
    position, // 0 = being made now, 1 = next, …
    status: j.status,
    stage: j.stage,
    stageLabel: j.status === "queued" ? STAGE_LABEL[j.stage === "waiting_slot" ? "waiting_slot" : "queued"] : STAGE_LABEL[j.stage] || j.stage,
    percent: kind === "preview" ? previewPercent(j) : jobPercent(j),
    label: j.label || j.title || "",
    title: j.title || "",
    questions: j.questions || 0,
    range: j.range || "",
    auto: !!j.auto,
    scheduleId: j.scheduleId || "",
    profileId: j.profileId || "",
    createdAt: j.createdAt,
    startedAt: j.startedAt || null,
    canStop: !stopBlockedReason(j),
    stopBlocked: stopBlockedReason(j),
  };
}
// Stop a queued or rendering video. A queued one is dropped at once; a running
// one stops at its next progress tick (seconds). Nothing is posted. Returns the
// job (or throws with a reason the admin can read).
export function stopLongVideoJob(id) {
  const j = jobs.get(String(id || ""));
  if (!j) throw Object.assign(new Error("That video is no longer in the queue."), { status: 404 });
  const why = stopBlockedReason(j);
  if (why) throw Object.assign(new Error(why), { status: 409 });
  j.cancelRequested = true;
  j.cancelReason = "stopped";
  if (j.status === "queued") {
    // Show it as stopped right away; its turn in the lane then just skips it.
    markCancelled(j, new Error(stopMessage(j)));
    if (!j.preview) { saveRecord(j); rollBackStoppedSchedule(j); }
  }
  return j;
}
// A stopped schedule video: put the schedule back on THIS part, so its next
// run makes it again (nothing was posted). Never throws.
function rollBackStoppedSchedule(job) {
  if (!job.scheduleId || job._rolledBack) return;
  job._rolledBack = true;
  reportToSchedule(job, false, { stopped: true }).catch(() => {});
}

// ---- Saved job records (survive a server restart / deploy) ----
// The live job runs in memory; its record in the database (LongVideoJob) keeps
// "Recent long videos" filled after a restart, and a job cut off by a restart
// is marked failed with the reason and a Retry. Best-effort: a database error
// never stops a video. Skipped in unit tests.
const PERSIST = !process.env.VITEST;
const Rec = () => import("../models/LongVideoJob.js").then((m) => m.default);
async function saveRecord(job, { create = false } = {}) {
  if (!PERSIST || job.preview) return;
  if (!create && job._recReady) await job._recReady; // never update before it exists
  try {
    const M = await Rec();
    const set = { status: job.status, view: publicJob(job), tenantKey: job.tenantKey };
    if (create) await M.create({ jobId: job.id, ...set, request: job.request || null });
    else await M.updateOne({ jobId: job.id }, { $set: set });
  } catch (e) {
    console.warn(`[longVideo] could not save job ${job.id}: ${e?.message || e}`);
  }
}
// Run `fn` (the job) while saving its progress every few seconds + at the end.
async function withRecord(job, fn) {
  const t = PERSIST ? setInterval(() => { saveRecord(job); }, 8000) : null;
  try { await fn(); } finally { if (t) clearInterval(t); await saveRecord(job); }
}

export async function listLongVideoJobs(tenantKey, limit = 10) {
  cleanup();
  // Only THIS account's videos (the main account or a cross-posting user).
  const pid = activeSocialProfileId();
  const mineP = (x) => String(x || "") === pid;
  const live = [...jobs.values()].filter((j) => j.tenantKey === tenantKey && !j.preview && mineP(j.profileId));
  const byId = new Map(live.map((j) => [j.id, { ...publicJob(j), canRetry: canRetryLive(j) }]));
  if (PERSIST) {
    try {
      const M = await Rec();
      const recs = await M.find({ tenantKey }).sort({ createdAt: -1 }).limit(limit * 4).lean();
      for (const r of recs || []) {
        if (!r?.view || byId.has(r.jobId) || !mineP(r.view.profileId)) continue;
        byId.set(r.jobId, { ...r.view, status: r.status, canRetry: r.status === "failed" && !!r.request && !r.retriedAs });
      }
    } catch { /* memory only */ }
  }
  return [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
}
const canRetryLive = (j) => j.status === "failed" && !!j.request && !j.retriedAs;

// On boot: any job still "queued" / "running" in the database was cut off by
// the restart — nothing more will happen to it. Mark it failed with the reason
// (so it doesn't look stuck) and roll a schedule's part back so it's re-made.
export async function recoverInterruptedLongVideoJobs() {
  if (!PERSIST) return 0;
  const M = await Rec();
  const stuck = await M.find({ status: { $in: ["queued", "running"] } }).lean();
  const msg = "The server restarted (e.g. an update was deployed) while this video was being made, so it was stopped. Tap Retry to make it again.";
  for (const r of stuck || []) {
    const partlyPosted = !!(r.view?.url || r.view?.fbUrl);
    const view = { ...(r.view || {}), status: "failed", stage: "failed", stageLabel: STAGE_LABEL.failed, error: partlyPosted ? `${msg} (It was already uploaded — check the links first.)` : msg, finishedAt: Date.now() };
    await M.updateOne({ jobId: r.jobId }, { $set: { status: "failed", view } }).catch(() => {});
    const req = r.request || {};
    if (req.scheduleId && !partlyPosted) {
      await reportToSchedule({ scheduleId: req.scheduleId, part: req.part || 0, startUsed: req.startUsed, request: req, error: "server restarted — this part will be made again", notes: [] }, false).catch(() => {});
    }
  }
  if (stuck?.length) console.log(`[longVideo] marked ${stuck.length} interrupted long-video job(s) as failed (server restart).`);
  return stuck?.length || 0;
}

// Retry a failed job (live or saved) with the same settings → the new job.
export async function retryLongVideoJob(id, tenantKey, { cfg, site }) {
  let req = null;
  let rec = null;
  const live = jobs.get(String(id));
  if (live && live.tenantKey === tenantKey && !live.preview) {
    if (live.status !== "failed") throw new Error("Only a failed video can be retried.");
    if (live.retriedAs) throw new Error("This video was already retried.");
    req = live.request;
  }
  if (!req && PERSIST) {
    const M = await Rec();
    rec = await M.findOne({ jobId: String(id), tenantKey }).lean();
    if (!rec) throw new Error("Video not found.");
    if (rec.status !== "failed") throw new Error("Only a failed video can be retried.");
    if (rec.retriedAs) throw new Error("This video was already retried.");
    req = rec.request;
  }
  if (!req) throw new Error("This video can't be retried — start it again from the form.");
  if (req.scheduleId && (await scheduleGone({ scheduleId: req.scheduleId }))) throw new Error("Its schedule was deleted — this video can't be retried.");
  const publishAt = req.publishAt && new Date(req.publishAt).getTime() > Date.now() + 5 * 60 * 1000 ? req.publishAt : null;
  const job = queueFullQuizVideo({
    source: req.source, cfg, site,
    titleTemplate: req.titleTemplate || "", privacy: req.privacy, publishAt, hashtags: req.hashtags || "",
    auto: !!req.auto, scheduleTitle: req.scheduleTitle || "",
    ...(req.playlist === "__default__" ? {} : { playlist: req.playlist || null }),
    useThumbnail: req.useThumbnail !== false, options: req.options || {}, scheduleId: req.scheduleId || "",
  });
  if (live) live.retriedAs = job.id;
  if (PERSIST) (await Rec()).updateOne({ jobId: String(id) }, { $set: { retriedAs: job.id } }).catch(() => {});
  return job;
}

export const tenantKeyNow = () => String(getCurrentTenantId() || "");

// Default title when only PART of a topic is in the video ("Questions 26–50").
export const DEFAULT_YT_PART_TITLE = "{subject} | {topic} | Questions {range}";
// Default title for a video that is one PART of a quiz (repeating schedule, or
// a one-off chunk). Keeps the quiz name and adds the part, e.g.
// "Accountancy | Basic Terms | Quiz 1 | Part 2". {quiz} drops out if the source
// is a whole topic with no single quiz name.
// "Economics | Characteristics and Problems of Developing Economy | Quiz 1 (Part 1) (25 Questions)"
export const DEFAULT_YT_SERIES_TITLE = "{stream} | {subject} | {topic} | {quiz} (Part {part}) ({count} Questions)";
export const DEFAULT_YT_SERIES_TITLE_NOQUIZ = "{stream} | {subject} | {topic} (Part {part}) ({count} Questions)";

// Default title template for a video (pure, tested):
//   the WHOLE quiz            → "… | Quiz 1 (25 Questions)"
//   PART of it (e.g. 25 of 50) → "… | Quiz 1 (Part 1) (25 Questions)"
// A whole topic (no quiz name) drops the quiz: "… | Topic (Part 2) (25 Questions)".
export function defaultLongVideoTitle({ isPart = false, hasQuiz = true } = {}) {
  if (isPart) return hasQuiz ? DEFAULT_YT_SERIES_TITLE : DEFAULT_YT_SERIES_TITLE_NOQUIZ;
  return hasQuiz ? DEFAULT_YT_LONG_TITLE : DEFAULT_YT_LONG_TITLE_NOQUIZ;
}
// Which part a chunk is: with 25 per video, questions 1–25 → Part 1, 26–50 →
// Part 2, even when the LAST part is shorter (41–50 at 20 per video → Part 3).
export function partNumberFor(first, perVideo) {
  return Math.floor((Math.max(1, Number(first) || 1) - 1) / Math.max(1, Number(perVideo) || 1)) + 1;
}

// The stream from a picker label "Stream › Subject › …" ("My Quiz › Stream ›
// Subject › …" for My Quiz) — only when the next part really is this subject,
// so an odd label never puts a wrong name in the title (pure, tested).
export function streamFromLabel(label, subject) {
  const parts = String(label || "").split("›").map((p) => displayName(p.trim())).filter(Boolean);
  if (parts[0] === "My Quiz") parts.shift();
  return parts.length >= 2 && subject && parts[1].toLowerCase() === String(subject).trim().toLowerCase() ? parts[0] : "";
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
    // The same vertical Short ALSO as a Facebook Reel / Instagram Reel.
    shortToFacebook: !!o.shortToFacebook,
    shortToInstagram: !!o.shortToInstagram,
    // Telegram: a message with the full video's (and the Short's) link.
    toTelegram: !!o.toTelegram,
    // Comment the full video's link under the YouTube Short and the Reels.
    linkComment: o.linkComment !== false,
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
    profileId: activeSocialProfileId(), // cross-posting user ("" = main account)
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
  // Everything needed to make it again (Retry after a failure / restart).
  job.request = {
    source, titleTemplate, privacy: job.privacy, publishAt: job.publishAt, hashtags, auto, scheduleTitle,
    playlist: playlist === undefined ? "__default__" : (playlist?.id ? playlist : null),
    useThumbnail: useThumbnail !== false, options, scheduleId: job.scheduleId, part: job.part, startUsed: job.startUsed,
  };
  jobs.set(job.id, job);
  job._recReady = saveRecord(job, { create: true });
  // Keep the caller's tenant context for the background run.
  const store = tenantStore.getStore();
  const args = { source, cfg, site, titleTemplate, hashtags, opts };
  const run = () => withRecord(job, () => (store ? tenantStore.run(store, () => runJob(job, args)) : runJob(job, args)));
  enqueue(job, run);
  return publicJob(job);
}

// When a scheduled long video finishes, write the real outcome back to its
// schedule row so the list shows "posted ✓" (not a forever "being made") and
// counts videos posted. On failure, roll the position back so the next run
// retries this same part. Never throws.
async function reportToSchedule(job, ok, { stopped = false } = {}) {
  if (!job.scheduleId) return;
  const FbSchedule = (await import("../models/FbSchedule.js")).default;
  const sch = await FbSchedule.findById(job.scheduleId).catch(() => null);
  if (!sch) return;
  const quizName = job.request?.source?.label ? String(job.request.source.label).split(" › ").pop() : "";
  const label = sch.longVideo?.byQuiz && quizName ? `${quizName}${job.part ? ` (Part ${job.part})` : ""}` : job.part ? `Part ${job.part}` : "Video";
  const lv = sch.longVideo || {};
  if (ok) {
    const links = [job.url, job.shortUrl, job.fbUrl].filter(Boolean).join(" · ");
    const extra = (job.notes || []).filter((n) => !/^(YouTube|Facebook) ✓/.test(n));
    sch.lastResult = `${label} posted ✓${links ? ` — ${links}` : ""}${extra.length ? ` · ${extra.join(" · ")}` : ""}`;
    sch.longVideo = { ...lv, postedCount: (Number(lv.postedCount) || 0) + 1 };
  } else {
    sch.lastResult = stopped
      ? `${label} was stopped by you — nothing was posted; it will be made again at the next run.`
      : `${label} failed: ${job.error}`;
    const src = job.request?.source || {};
    if (lv.byQuiz && (src.quiz || src.testSeries)) {
      // Quiz by quiz: make THIS quiz / part again next run (and keep the
      // schedule going if it had just been marked finished).
      sch.longVideo = { ...lv, quizId: String(src.quiz || src.testSeries), nextStart: job.startUsed || 1, part: Math.max(0, (job.part || 1) - 1) };
      if (sch.completedAt) { sch.completedAt = null; sch.enabled = true; }
    } else if (Number.isInteger(job.startUsed) && job.startUsed > 0) {
      sch.longVideo = { ...lv, nextStart: job.startUsed, part: Math.max(0, (job.part || 1) - 1) };
    }
  }
  sch.markModified?.("longVideo");
  await sch.save().catch(() => {});
}

// Everything a long video needs BEFORE rendering: the questions, its title and
// the shared slideshow options (intro / end slides, templates, narration).
// Used by the real job AND the preview, so the preview is the same video.
// Fills job.questions / job.range / job.title / job.notes.
async function planLongVideo(job, { source, cfg, site, titleTemplate, opts }) {
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
  // The stream the admin PICKED wins (a subject can be listed under several
  // streams; the database only knows its home one).
  names.stream = streamFromLabel(source?.label, names.subject) || names.stream || "";
  const breadcrumb = await breadcrumbForQuestion(questions[0]);
  job.tagNames = { stream: names.stream, subject: names.subject || "", topic: names.topic || "" };
  // Part number of THIS video within the quiz/source. For a repeating
  // schedule it's opts.part; for a one-off chunk (Choose how many + Start
  // from), derive it from where it starts. A 100-question quiz at 25/video →
  // Part 1 (Q1–25), Part 2 (Q26–50) … all keep the same quiz name.
  let partNum = Number(opts.part) || 0;
  if (!partNum && partial && opts.order !== "random") {
    // Use the chosen questions-per-video, not this video's count, so a shorter
    // LAST part still gets the right number.
    partNum = partNumberFor(first, opts.count || questions.length);
  }
  // A part only when the video does NOT hold the whole quiz/topic (a quiz of
  // exactly 25 questions in one video is just "Quiz 1 (25 Questions)").
  const isPart = partial;
  // The quiz name only when ONE quiz (or My Quiz) was picked — a whole topic
  // mixes several quizzes, so "Quiz 1" (the first question's quiz) would be wrong.
  const quizName = source?.quiz || source?.testSeries ? names.quiz : "";
  const tpl = (titleTemplate || defaultLongVideoTitle({ isPart, hasQuiz: !!quizName }))
    .replace(/\{range\}/gi, job.range || `1–${questions.length}`)
    .replace(/\{part\}/gi, String(partNum || 1));
  job.title = buildYtTitle(tpl, {
    stream: names.stream,
    subject: names.subject || names.quiz || displayTrail(source?.label),
    topic: names.topic,
    quiz: quizName,
    count: questions.length,
  }, displayTrail(source?.label) || "Quiz");

  const siteUrl = (cfg.siteUrl || "https://www.mystudyguide.in").replace(/\/+$/, "");
  // Shared slideshow options — an opening title slide and a closing
  // "thanks for watching" slide wrap every long video.
  const slideBase = {
    orientation: "landscape",
    keepFile: true,
    voice: opts.voice || site?.slideshowVoice,
    autoCaptions: opts.autoCaptions,
    questionSec: opts.questionSec,
    answerSec: opts.answerSec,
    slidesMode: opts.slidesMode,
    reveal: opts.reveal,
    read: opts.read,
    questionTemplateUrl: opts.useTemplates ? site?.longVideoQuestionTemplateUrl || "" : "",
    answerTemplateUrl: opts.useTemplates ? site?.longVideoAnswerTemplateUrl || "" : "",
    introTemplateUrl: opts.useTemplates ? site?.longVideoIntroTemplateUrl || "" : "",
    outroTemplateUrl: opts.useTemplates ? site?.longVideoOutroTemplateUrl || "" : "",
    shortOutroTemplateUrl: opts.useTemplates ? site?.longVideoShortOutroTemplateUrl || "" : "",
    // Intro / end / Short-end text boxes (same styling engine as the thumbnail).
    // Narration + on-screen seconds apply always; the template only when
    // templates are on.
    slideText: Object.fromEntries(["intro", "outro", "shortintro", "shortoutro"].map((r) => {
      const c = slideTextConfigFromSite(site, r);
      return [r, opts.useTemplates ? c : { ...c, templateUrl: "" }];
    })),
    site: opts.engine ? { ...site, ttsProvider: opts.engine } : site,
    // This account's video branding (header + footer) — see utils/videoBrand.js.
    ...slideshowBrandOpts(site, { siteUrl }),
    subjectName: breadcrumb || "",
  };
  const intro = { subject: names.subject || names.quiz || displayTrail(source?.label), topic: names.topic };
  // The Short is rendered VERTICAL (1080×1920) from the start: its own 9:16
  // intro + end templates, the 9:16 Reel question / answer templates (AI
  // Slideshow card), and up to 3 min long (YouTube Shorts limit) — no
  // landscape video squeezed onto a blurred background.
  const shortBase = {
    ...slideBase,
    orientation: "portrait",
    questionTemplateUrl: opts.useTemplates ? site?.slideshowQuestionTemplateUrl || "" : "",
    answerTemplateUrl: opts.useTemplates ? site?.slideshowAnswerTemplateUrl || "" : "",
    introTemplateUrl: "",
    outroTemplateUrl: "",
    shortIntroTemplateUrl: opts.useTemplates ? site?.longVideoShortIntroTemplateUrl || "" : "",
    shortOutroTemplateUrl: opts.useTemplates ? site?.longVideoShortOutroTemplateUrl || "" : "",
    maxTotalSec: 175,
    intro: { ...intro, role: "shortintro" },
    outro: "short",
  };
  return { questions, names, breadcrumb, first, siteUrl, slideBase, intro, shortBase };
}

// The template thumbnail for a video (or null + a note when it fails).
async function drawLongVideoThumbnail(job, { source, cfg, site, names, questions }) {
  const { renderYoutubeThumbnail } = await import("./ytThumbnail.js");
  const r = await renderYoutubeThumbnail({
    ...cfg.ytThumb,
    // Subject | Topic | Quiz of THIS video. The quiz name only when one quiz
    // (or My Quiz) was picked — a whole topic mixes several quizzes.
    lines: thumbnailLines({
      stream: names.stream,
      subject: names.subject || displayTrail(source?.label),
      topic: names.topic,
      quiz: source?.quiz || source?.testSeries ? names.quiz : "",
      count: questions.length,
      range: job.range,
    }),
    brandColor: site?.brandColor || site?.primaryColor,
  });
  if (r.image) return r;
  job.notes.push(`Thumbnail ✗ (${r.error})`);
  return null;
}

// Post an already-rendered long video (+ its Short) to YouTube and/or
// Facebook: upload, thumbnail, playlist, the Short with a link to the full
// video, then Facebook. Used by a normal run AND by "Publish" on a preview (the
// exact files that were previewed). getShort() → { path, count } makes / fetches
// the Short only when it's needed. Returns the Short's local path (the caller
// deletes it). Throws when nothing could be uploaded.
async function uploadRendered(job, { cfg, opts, filePath, description, tags, thumbnail, breadcrumb, getShort: makeShort, site = null }) {
  // The social links: under the Short on YouTube, and as a comment on Facebook / Instagram.
  if (site?.socialLinksOnYoutube !== false) job.followLinks = formatSocialLinks(site?.socialLinks, { exclude: ["youtube"], siteUrl: cfg.siteUrl });
  const errors = [];
  let anyOk = false;
  // The Short is made / fetched ONCE, then used for YouTube, Facebook and Instagram.
  let shortOnce = null;
  const getShort = () => (shortOnce ||= makeShort());
  const scheduled = !!job.publishAt;
  // 1) YouTube — the FULL landscape video (normal).
  if (opts.toYoutube) {
    job.stage = "uploading";
    job.progress = { done: 0, total: 100 };
    const up = await uploadVideoFileToYoutube({
      filePath,
      title: job.title,
      // + the admin's own "text for every video" (YouTube).
      description: withVideoText(description, customVideoText(site, "youtube")),
      tags: buildYtTags(tags, { first: [job.tagNames?.stream, job.tagNames?.subject, job.tagNames?.topic] }), // subject & topic as readable tags first
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
        // The vertical (9:16) short: Short intro + the first 3 questions + a
        // closing "watch the full quiz on our channel" slide.
        const short = await getShort();
        const shortPath = short.path;
        const shortDesc = buildYtLongDescription({
          title: job.title,
          intro: `${short.count} sample question${short.count === 1 ? "" : "s"}${breadcrumb ? ` — ${breadcrumb}` : ""}. Watch the full video here: ${job.url}`,
          hashtags: tags,
          shorts: true,
          followLinks: job.followLinks || "",
        });
        const shortDescFull = withVideoText(shortDesc, customVideoText(site, "youtube"));
        const s = await uploadVideoFileToYoutube({
          filePath: shortPath,
          title: shortTitle(job.title),
          description: shortDescFull,
          tags: buildYtTags(tags, { first: [job.tagNames?.stream, job.tagNames?.subject, job.tagNames?.topic] }), // subject & topic as readable tags first
          privacy: job.privacy,
          publishAt: job.publishAt,
        }, cfg);
        if (s.ok) {
          job.shortUrl = s.url;
          job.shortId = s.id;
          // The Short is NOT added to the long video's playlist — that playlist
          // is for full videos only (a Short there sat next to its own full video).
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
    const fb = await postLongVideoToFacebookPage({ filePath, title: job.title, description: withVideoText(description, customVideoText(site, "facebook")), publishAt: job.publishAt, thumbnail }, cfg);
    if (fb.ok) {
      anyOk = true;
      job.fbUrl = fb.url;
      if (!fb.scheduled && site) {
        const { postSocialLinksComment } = await import("./facebook.js");
        await postSocialLinksComment({ site, cfg, fbPostId: fb.id, notes: job.notes });
      }
      job.notes.push(`Facebook ✓${fb.scheduled ? " (scheduled)" : ""}${fb.late ? " (scheduled time was too close — published right away)" : ""}`);
    } else {
      errors.push(`Facebook: ${fb.error}`);
      job.notes.push(`Facebook ✗ (${fb.error})`);
    }
  }
  if (!anyOk) throw new Error(errors.join(" · ") || "Nothing was uploaded.");

  // 3) The Short as a Facebook Reel / Instagram Reel, and 4) the full video's
  //    link as the first comment under the Short and each Reel. Best-effort —
  //    a failure here never fails the job (the full video is already up).
  await postShortReelsAndLinks(job, { cfg, opts, tags, getShort, scheduled, site });
}

// "Watch the full video: <link>" — the link under the Facebook Reel (Facebook
// makes it tappable).
export function fullVideoComment(url) {
  return url ? `▶ Watch the full video (all questions with answers): ${url}` : "";
}

// The same pointer for places where links are NEVER tappable — YouTube Shorts
// comments and Instagram captions/comments — so a raw URL would be dead text.
// Instead tell viewers where to find it (and the title to search for).
//   platform: "youtube" (under the Short) | "instagram" (Reel caption/comment)
//   where:    "youtube" | "facebook" — where the full video actually lives
export function fullVideoNoLinkComment({ platform = "youtube", where = "youtube", title = "", cta = "" } = {}) {
  const t = String(title || "").trim();
  const search = t ? `\n🔎 Search: "${t}"` : "";
  if (platform === "youtube" && where === "youtube") {
    return `▶ Watch the full video (all questions with answers): tap our channel name → Videos${search}`;
  }
  const home = where === "facebook" ? "Facebook Page" : "YouTube channel";
  const call = String(cta || "").trim();
  return `▶ Watch the full video (all questions with answers) on our ${home}${search}${call ? `\n${call}` : ""}`;
}

// Telegram gets the LINK to the long video (not the file): title, the full
// video's link (+ the Short's) and the hashtags.
export function longVideoTelegramText(job, tags = "") {
  const links = [job.url && `▶ Watch the full video: ${job.url}`, !job.url && job.fbUrl && `▶ Watch the full video: ${job.fbUrl}`, job.shortUrl && `⚡ Short: ${job.shortUrl}`].filter(Boolean);
  return [job.title, links.join("\n"), tags].filter(Boolean).join("\n\n");
}

async function postShortReelsAndLinks(job, { cfg, opts, tags, getShort, scheduled, site = null }) {
  const fullUrl = job.url || job.fbUrl || "";
  if (opts.toTelegram) {
    const { telegramReady } = await import("./facebook.js");
    if (!telegramReady(cfg)) job.notes.push("Telegram ✗ (not connected)");
    else if (!fullUrl) job.notes.push("Telegram ✗ (no video link to share)");
    else if (scheduled) job.notes.push("Telegram skipped — the video is scheduled (the link isn't public yet)");
    else {
      const { sendTelegramMessage } = await import("./telegram.js");
      const r = await sendTelegramMessage({ text: longVideoTelegramText(job, tags) }, cfg);
      job.notes.push(r.ok ? "Telegram link ✓" : `Telegram ✗ (${r.error})`);
    }
  }
  const comment = opts.linkComment !== false ? fullVideoComment(fullUrl) : "";
  // Shorts comments and Instagram never make links tappable — use a no-link
  // pointer there instead of a dead URL.
  const where = job.url ? "youtube" : "facebook";
  const cta = linkInBioOf(cfg);
  const shortComment = comment ? fullVideoNoLinkComment({ platform: "youtube", where, title: job.title }) : "";
  const igComment = comment ? fullVideoNoLinkComment({ platform: "instagram", where, title: job.title, cta }) : "";
  const wantReels = (opts.shortToFacebook || opts.shortToInstagram) && isFacebookConfigured(cfg);
  if ((opts.shortToFacebook || opts.shortToInstagram) && !isFacebookConfigured(cfg)) job.notes.push("Reels ✗ (connect Facebook first)");
  if (scheduled && (wantReels || (comment && job.shortId))) {
    // A scheduled video isn't public yet: Reels would go out early and the
    // link wouldn't open. Post them with "Publish now" (or a repeating schedule).
    if (wantReels) job.notes.push("Reels skipped — the video is scheduled; Reels are posted only when publishing right away");
    if (comment && job.shortId) job.notes.push("Link comment skipped — the video is scheduled (it isn't public yet)");
    return;
  }
  // YouTube Short → the full video's link.
  if (comment && job.shortId) {
    const c = await commentOnYoutubeVideo({ videoId: job.shortId, text: shortComment }, cfg);
    job.notes.push(c.ok ? "Short link comment ✓ (pin it in YouTube)" : `Short link comment ✗ (${c.error})`);
  }
  // The ONLY tappable link on a Short is its "Related video", and the YouTube
  // API can't set it — so hand the admin the exact Studio page to set it once.
  if (job.shortId && job.url && !scheduled) {
    job.notes.push(`Make the Short's link tappable: open https://studio.youtube.com/video/${job.shortId}/edit → Related video → pick the full video`);
  }
  if (!wantReels) return;
  job.stage = "reels";
  job.progress = null;
  let reelUrl = "";
  try {
    const short = await getShort();
    reelUrl = short.url || "";
    if (!reelUrl) {
      // Meta fetches the video from a public URL — host the Short on Cloudinary.
      const { isCloudinaryConfigured, uploadFileToCloudinary } = await import("./cloudinary.js");
      if (!isCloudinaryConfigured()) throw new Error("media storage (Cloudinary) isn't set up");
      reelUrl = (await uploadFileToCloudinary(short.path, { resourceType: "video", folder: "mystudyguide/longvideo/reels" })).secure_url;
    }
  } catch (e) {
    job.notes.push(`Reels ✗ (${e?.message || e})`);
    return;
  }
  const caption = withVideoText([job.title, fullUrl ? `Watch the full video: ${fullUrl}` : "", tags].filter(Boolean).join("\n\n"), customVideoText(site, "facebook"));
  if (opts.shortToFacebook) {
    const r = await postReelToFacebookPage({ videoUrl: reelUrl, description: caption }, cfg);
    if (r.ok) {
      job.fbReelUrl = `https://www.facebook.com/reel/${r.id}`;
      let n = "Facebook Reel ✓";
      if (comment) {
        const c = await commentOnFacebookPost({ postId: r.id, message: comment }, cfg);
        n += c.ok ? " · link comment ✓ (pin it on Facebook)" : ` · link comment ✗ (${c.error})`;
      }
      job.notes.push(n);
      if (site) { const { postSocialLinksComment } = await import("./facebook.js"); await postSocialLinksComment({ site, cfg, fbPostId: r.id, notes: job.notes }); }
    } else job.notes.push(`Facebook Reel ✗ (${r.error})`);
  }
  if (opts.shortToInstagram) {
    const igCaption = [job.title, fullUrl ? fullVideoNoLinkComment({ platform: "instagram", where, cta }) : "", tags].filter(Boolean).join("\n\n");
    const r = await postReelToInstagram({ videoUrl: reelUrl, caption: igCaption }, cfg);
    if (r.ok) {
      job.igReelId = r.id;
      let n = "Instagram Reel ✓";
      if (igComment) {
        const c = await commentOnInstagramMedia({ mediaId: r.id, message: igComment }, cfg);
        n += c.ok ? " · link comment ✓ (pin it on Instagram)" : ` · link comment ✗ (${c.error})`;
      }
      job.notes.push(n);
      if (site) { const { postSocialLinksComment } = await import("./facebook.js"); await postSocialLinksComment({ site, cfg, igMediaId: r.id, notes: job.notes }); }
    } else job.notes.push(`Instagram Reel ✗ (${r.error})`);
  }
}

async function runJob(job, { source, cfg, site, titleTemplate, hashtags, opts }) {
  if (job.status === "cancelled") return; // stopped while it waited in the queue
  job.status = "running";
  job.startedAt = Date.now();
  job.stage = "picking";
  let filePath = "";
  let shortPath = ""; // the vertical Short copy (deleted at the end)
  try {
    await stopIfScheduleGone(job); // deleted while it waited in the queue
    const { questions, names, breadcrumb, first, siteUrl, slideBase, intro, shortBase } = await planLongVideo(job, { source, cfg, site, titleTemplate, opts });
    const onStatus = (st) => { throwIfStopped(job); job.stage = String(st || "").toLowerCase(); };
    const onProgress = (stage, done, total) => { throwIfStopped(job); job.stage = String(stage || "").toLowerCase(); job.progress = { done, total }; };
    const result = await generateSlideshow(questions, {
      ...slideBase,
      intro,
      outro: "full",
      onStatus,
      onProgress,
    });
    filePath = result.filePath;
    job.duration = result.duration;
    if (!filePath) throw new Error("The video file was not produced.");
    if (result.ttsNote) job.notes.push(result.ttsNote);

    const tags = await hashtagsForQuestion(questions[0], site, hashtags);
    const offset = opts.order === "random" ? 0 : first - 1;
    const description = buildYtLongDescription({
      title: job.title, // the description starts with the title
      followLinks: site?.socialLinksOnYoutube !== false ? formatSocialLinks(site?.socialLinks, { exclude: ["youtube"], siteUrl }) : "",
      intro: `${questions.length} questions with answers${job.range ? ` (questions ${job.range})` : ""}${breadcrumb ? ` — ${breadcrumb}` : ""}.`,
      chapters: (result.chapters || []).map((c) => ({ ...c, label: `Question ${offset + c.question}` })),
      hashtags: tags,
      siteUrl,
    });

    // Template thumbnail — drawn ONCE, used by YouTube and Facebook.
    let thumbnail = null;
    if (job.useThumbnail) {
      job.stage = "finishing";
      thumbnail = await drawLongVideoThumbnail(job, { source, cfg, site, names, questions });
    }

    await stopIfScheduleGone(job); // deleted / stopped while the video was being made
    job.uploadStarted = true; // from here on "Stop" is refused (no half-posted videos)
    await uploadRendered(job, {
      cfg, site, opts, filePath, description, tags, thumbnail, breadcrumb,
      // The Short is rendered only when it will be posted (deleted in finally).
      getShort: async () => {
        const teaserQs = questions.slice(0, 3);
        const r = await generateSlideshow(teaserQs, shortBase);
        shortPath = r.filePath;
        return { path: r.filePath, count: teaserQs.length };
      },
    });

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
    // Cancelled because its schedule was deleted: no error email, no retry.
    if (e?.code === CANCELLED) {
      markCancelled(job, e);
      if (job.cancelReason === "stopped") rollBackStoppedSchedule(job);
      return;
    }
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


// ---- Preview (nothing is posted) ----
//
// Makes EXACTLY what a real run would: the full landscape video (every chosen
// question, intro + end slides), the template thumbnail and — always — the
// vertical Short teaser (intro + first 3 questions + Short end slide). The
// files go to Cloudinary so the browser can play them. Runs on the same
// same per-account lane as real videos (it is just as heavy).

// Overall % of a preview: the full render is the big part, then the Short.
//   phase "full" 0–70 · "short" (rendered 9:16) 70–93 · "upload"/"thumb" 93–99
const PREVIEW_PHASE = { picking: [0, 2], full: [2, 68], short: [70, 23], upload: [93, 4], thumb: [97, 2] };
const RENDER_STAGE = { pending: [0, 0.02], generating_slides: [0.02, 0.55], generating_audio: [0.57, 0.2], rendering_video: [0.77, 0.2], ready: [0.97, 0.03] };
export function previewPercent(j) {
  if (!j) return 0;
  if (j.status === "done") return 100;
  if (j.status === "queued") return 0;
  const [base, span] = PREVIEW_PHASE[j.phase] || [0, 0];
  let frac = 0;
  if (j.phase === "full" || j.phase === "short") {
    const [sb, ss] = RENDER_STAGE[j.stage] || [0, 0];
    const within = j.progress && j.progress.total > 0 ? Math.max(0, Math.min(1, j.progress.done / j.progress.total)) : 0;
    frac = sb + ss * within;
  }
  return Math.max(0, Math.min(99, Math.round(base + span * frac)));
}

export function publicPreviewJob(j) {
  if (!j) return null;
  return {
    id: j.id,
    status: j.status,
    phase: j.phase,
    stage: j.stage,
    stageLabel: j.status === "queued" ? STAGE_LABEL[j.stage === "waiting_slot" ? "waiting_slot" : "queued"] : STAGE_LABEL[j.stage] || j.stage,
    progress: j.progress,
    percent: previewPercent(j),
    title: j.title,
    questions: j.questions,
    range: j.range || "",
    duration: j.duration,
    videoUrl: j.videoUrl || "",
    shortUrl: j.shortUrl || "",
    shortQuestions: j.shortQuestions || 0,
    shortDuration: j.shortDuration || 0,
    thumbnailUrl: j.thumbnailUrl || "",
    voice: j.voice || "",
    canPublish: j.status === "done" && !!j.publishData && !!j.videoUrl && !j.publishedJobId,
    publishedJobId: j.publishedJobId || "",
    notes: j.notes || [],
    error: j.error,
    createdAt: j.createdAt,
    startedAt: j.startedAt || null,
    finishedAt: j.finishedAt,
  };
}

export function queueLongVideoPreview({ source, cfg, site, titleTemplate = "", useThumbnail = true, options = {}, ownerId = "" }) {
  cleanup();
  const opts = normalizeLongVideoOptions(options, site);
  const job = {
    id: randomUUID(),
    tenantKey: tenantKeyNow(),
    profileId: activeSocialProfileId(), // cross-posting user ("" = main account)
    preview: true,
    owner: ownerId ? String(ownerId) : "",
    status: "queued",
    phase: "picking",
    stage: "queued",
    progress: null,
    label: source?.label || "",
    title: "",
    questions: 0,
    range: "",
    duration: 0,
    videoUrl: "",
    shortUrl: "",
    thumbnailUrl: "",
    error: "",
    notes: [],
    useThumbnail: useThumbnail !== false && thumbTemplateActive(cfg.ytThumb),
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  jobs.set(job.id, job);
  const store = tenantStore.getStore();
  const args = { source, cfg, site, titleTemplate, opts };
  const run = () => (store ? tenantStore.run(store, () => runPreview(job, args)) : runPreview(job, args));
  enqueue(job, run);
  return publicPreviewJob(job);
}

export function getLongVideoPreview(id, tenantKey, ownerId) {
  const j = jobs.get(String(id));
  if (!j || !j.preview || j.tenantKey !== tenantKey) return null;
  if (j.owner && ownerId && j.owner !== String(ownerId)) return null;
  return j;
}

async function runPreview(job, { source, cfg, site, titleTemplate, opts }) {
  if (job.status === "cancelled") return; // stopped while it waited in the queue
  job.status = "running";
  job.startedAt = Date.now();
  job.stage = "picking";
  const temp = [];
  try {
    const { isCloudinaryConfigured, uploadFileToCloudinary } = await import("./cloudinary.js");
    if (!isCloudinaryConfigured()) throw new Error("Media storage isn't set up (Cloudinary keys missing), so the preview can't be played.");
    const { questions, names, breadcrumb, first, siteUrl, slideBase, intro, shortBase } = await planLongVideo(job, { source, cfg, site, titleTemplate, opts });
    const track = (phase) => ({
      onStatus: (st) => { throwIfStopped(job); job.phase = phase; job.stage = String(st || "").toLowerCase(); job.progress = null; },
      onProgress: (st, done, total) => { throwIfStopped(job); job.phase = phase; job.stage = String(st || "").toLowerCase(); job.progress = { done, total }; },
    });

    // 1) The FULL video — every chosen question, intro + end slide.
    job.phase = "full";
    const full = await generateSlideshow(questions, { ...slideBase, intro, outro: "full", ...track("full") });
    if (!full.filePath) throw new Error("The video file was not produced.");
    temp.push(full.filePath);
    job.duration = full.duration;
    job.voice = full.voice || "";
    if (full.ttsNote) job.notes.push(full.ttsNote);
    // What "Publish" needs later to post THESE files (no re-render).
    job.publishData = {
      source, opts, breadcrumb, siteUrl, names,
      firstQuestion: questions[0],
      chapters: full.chapters || [],
      offset: opts.order === "random" ? 0 : first - 1,
    };

    // 2) The SHORT — rendered vertical (9:16): Short intro + first 3 questions + Short end slide.
    job.phase = "short";
    const teaserQs = questions.slice(0, 3);
    const shortRender = await generateSlideshow(teaserQs, { ...shortBase, ...track("short") });
    if (!shortRender.filePath) throw new Error("The Short video file was not produced.");
    const shortPath = shortRender.filePath;
    temp.push(shortPath);
    job.shortQuestions = teaserQs.length;
    job.shortDuration = shortRender.duration;

    // 3) Upload both so the browser can play them.
    throwIfStopped(job);
    job.phase = "upload";
    job.uploadStarted = true;
    job.stage = "uploading_preview";
    job.progress = null;
    const folder = "mystudyguide/longvideo/preview";
    const [upFull, upShort] = await Promise.all([
      uploadFileToCloudinary(full.filePath, { resourceType: "video", folder }),
      uploadFileToCloudinary(shortPath, { resourceType: "video", folder }),
    ]);
    job.videoUrl = upFull.secure_url;
    job.shortUrl = upShort.secure_url;

    // 4) The thumbnail YouTube / Facebook would get.
    job.phase = "thumb";
    job.stage = "finishing";
    if (job.useThumbnail) {
      const t = await drawLongVideoThumbnail(job, { source, cfg, site, names, questions });
      if (t?.image) {
        const ext = /png/i.test(t.mime || "") ? "png" : "jpg";
        const p = path.join(os.tmpdir(), `msg-thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
        await fs.writeFile(p, t.image);
        temp.push(p);
        const up = await uploadFileToCloudinary(p, { resourceType: "image", folder }).catch((e) => { job.notes.push(`Thumbnail ✗ (${e?.message || e})`); return null; });
        if (up?.secure_url) job.thumbnailUrl = up.secure_url;
        job.thumb = { image: t.image, mime: t.mime }; // kept for "Publish"
      }
    } else {
      job.notes.push("No thumbnail — upload/enable a thumbnail template in the YouTube card (or tick “Use thumbnail”).");
    }

    job.status = "done";
    job.stage = "done";
    job.finishedAt = Date.now();
  } catch (e) {
    if (e?.code === CANCELLED) { markCancelled(job, e); return; }
    job.status = "failed";
    job.stage = "failed";
    job.error = String(e?.message || e).slice(0, 500);
    job.finishedAt = Date.now();
  } finally {
    await Promise.all(temp.map((p) => fs.rm(p, { force: true }).catch(() => {})));
  }
}


// ---- Publish a finished preview (the SAME files — nothing is re-rendered) ----
//
// The previewed full video + Short (on Cloudinary) are downloaded again and
// posted exactly like a normal run: YouTube (+ thumbnail, playlist, the Short
// with a link to the full video) and/or Facebook. Shows as a normal job in
// "Recent long videos". One publish per preview.

async function downloadToFile(url, ext) {
  const { Readable } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");
  const { createWriteStream } = await import("node:fs");
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not fetch the preview file (HTTP ${res.status}) — make the preview again.`);
  const p = path.join(os.tmpdir(), `msg-publish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(p));
  return p;
}

// preview: the finished preview job. Destinations / privacy / time / playlist /
// hashtags come from the form at the moment "Publish" is tapped.
export function queuePublishPreview({ preview, cfg, site, privacy, publishAt = null, hashtags = "", playlist, options = {} }) {
  cleanup();
  if (!preview || preview.status !== "done" || !preview.publishData || !preview.videoUrl) throw new Error("This preview can't be published — make the preview again.");
  if (preview.publishedJobId) throw new Error("This preview has already been published.");
  const base = preview.publishData.opts || {};
  const opts = {
    ...base, toYoutube: options.toYoutube !== false, toFacebook: !!options.toFacebook, asShort: !!options.asShort,
    shortToFacebook: !!options.shortToFacebook, shortToInstagram: !!options.shortToInstagram, linkComment: options.linkComment !== false,
    toTelegram: !!options.toTelegram,
  };
  if (!opts.toYoutube && !opts.toFacebook) throw new Error("Choose where to post the video (YouTube and/or Facebook).");
  if (opts.toYoutube && !isYoutubeConfigured(cfg)) throw new Error("Connect YouTube first (YouTube Shorts card) — or untick YouTube.");
  if (opts.toFacebook && !isFacebookConfigured(cfg)) throw new Error("Connect your Facebook Page first — or untick Facebook.");
  const job = {
    id: randomUUID(),
    tenantKey: tenantKeyNow(),
    profileId: activeSocialProfileId(), // cross-posting user ("" = main account)
    status: "queued",
    stage: "queued",
    progress: null,
    label: preview.label || "",
    title: preview.title,
    questions: preview.questions,
    range: preview.range || "",
    duration: preview.duration,
    url: "", videoId: "", fbUrl: "", shortUrl: "",
    toYoutube: opts.toYoutube,
    toFacebook: opts.toFacebook,
    privacy: privacy || cfg.ytPrivacy || "public",
    publishAt: publishAt || null,
    error: "",
    notes: ["Published from the preview (same video — not re-made)"],
    playlist: playlist === undefined
      ? (cfg.ytLongPlaylistId ? { id: cfg.ytLongPlaylistId, title: cfg.ytLongPlaylistTitle || "" } : null)
      : (playlist?.id ? playlist : null),
    useThumbnail: !!preview.thumb,
    auto: false,
    scheduleId: "",
    fromPreview: preview.id,
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  preview.publishedJobId = job.id;
  job._recReady = saveRecord(job, { create: true });
  const store = tenantStore.getStore();
  const args = { preview, cfg, site, hashtags, opts };
  const run = () => withRecord(job, () => (store ? tenantStore.run(store, () => runPublish(job, args)) : runPublish(job, args)));
  enqueue(job, run);
  return publicJob(job);
}

async function runPublish(job, { preview, cfg, site, hashtags, opts }) {
  if (job.status === "cancelled") { preview.publishedJobId = ""; return; } // stopped while queued
  job.status = "running";
  job.startedAt = Date.now();
  job.uploadStarted = true; // publishing is all uploads — it can't be stopped half-way
  job.stage = "picking";
  const temp = [];
  try {
    const d = preview.publishData;
    job.tagNames = { stream: d.names?.stream || "", subject: d.names?.subject || "", topic: d.names?.topic || "" };
    job.stage = "downloading_preview";
    const filePath = await downloadToFile(preview.videoUrl, "mp4");
    temp.push(filePath);
    const tags = await hashtagsForQuestion(d.firstQuestion, site, hashtags);
    const description = buildYtLongDescription({
      title: job.title,
      followLinks: site?.socialLinksOnYoutube !== false ? formatSocialLinks(site?.socialLinks, { exclude: ["youtube"], siteUrl: d.siteUrl }) : "",
      intro: `${job.questions} questions with answers${job.range ? ` (questions ${job.range})` : ""}${d.breadcrumb ? ` — ${d.breadcrumb}` : ""}.`,
      chapters: (d.chapters || []).map((c) => ({ ...c, label: `Question ${d.offset + c.question}` })),
      hashtags: tags,
      siteUrl: d.siteUrl,
    });
    await uploadRendered(job, {
      cfg, site, opts, filePath, description, tags, breadcrumb: d.breadcrumb,
      thumbnail: job.useThumbnail ? preview.thumb : null,
      getShort: async () => {
        if (!preview.shortUrl) throw new Error("the preview has no Short");
        const p = await downloadToFile(preview.shortUrl, "mp4");
        temp.push(p);
        return { path: p, count: preview.shortQuestions || 3, url: preview.shortUrl }; // already public → Reels use it directly
      },
    });
    job.status = "done";
    job.stage = "done";
    job.finishedAt = Date.now();
    if (site?.fbNotifyOnPost === true) {
      const links = [job.url, job.shortUrl, job.fbUrl].filter(Boolean);
      await fbNotify({
        site,
        subject: `🎬 Long video posted — ${job.title}`,
        text: `Posted "${job.title}" (${job.questions} questions):\n${links.join("\n")}\n${job.notes.join(" · ")}`,
        html: `<p>🎬 Posted <b>${escHtml(job.title)}</b> (${job.questions} questions).</p>${links.map((u) => `<p><a href="${escHtml(u)}">${escHtml(u)}</a></p>`).join("")}<p>${escHtml(job.notes.join(" · "))}</p>`,
      }).catch(() => {});
    }
  } catch (e) {
    job.status = "failed";
    job.stage = "failed";
    job.error = String(e?.message || e).slice(0, 500);
    job.finishedAt = Date.now();
    // Nothing went up → allow another try from the same preview.
    if (!job.url && !job.fbUrl) preview.publishedJobId = "";
  } finally {
    await Promise.all(temp.map((p) => fs.rm(p, { force: true }).catch(() => {})));
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
    // "Quiz by quiz" through a whole topic: start at quizStartId; quizId /
    // quizIdx = the quiz the NEXT run makes (nextStart = its next question).
    byQuiz: !!lv.byQuiz,
    quizStartId: /^[a-f0-9]{24}$/i.test(String(lv.quizStartId || "")) ? String(lv.quizStartId) : "",
    quizId: /^([a-f0-9]{24}|__end__)$/i.test(String(lv.quizId ?? prev?.quizId ?? "")) ? String(lv.quizId ?? prev?.quizId) : "",
    quizIdx: clampInt(lv.quizIdx ?? prev?.quizIdx, 0, 0, 100000),
    postedCount: clampInt(lv.postedCount ?? prev?.postedCount, 0, 0, 1000000),
  };
}

// ---- "Quiz by quiz" through a whole topic ----

// The quizzes of a topic, in the admin list's order (natural: Quiz 1, 2 … 10),
// skipping disabled / deleted ones. Hidden quizzes are included.
// source: { topic } (Quiz Bank: every quiz of the topic's sessions), { session },
// or { practiceTopic } (My Quiz items). → [{ kind: "quiz"|"testSeries", id, name }]
export async function topicQuizList(source = {}) {
  const { naturalCompare } = await import("../utils/naturalSort.js");
  const live = { deleted: { $ne: true }, disabled: { $ne: true } };
  if (source.practiceTopic) {
    const TestSeries = (await import("../models/TestSeries.js")).default;
    const items = await TestSeries.find({ practice: true, practiceTopic: source.practiceTopic, ...live }).select("name").lean();
    return items.sort((a, b) => naturalCompare(a.name, b.name)).map((t) => ({ kind: "testSeries", id: String(t._id), name: t.name || "" }));
  }
  const Quiz = (await import("../models/Quiz.js")).default;
  let sessions = [];
  if (source.session) sessions = [{ _id: source.session, title: "" }];
  else if (source.topic) {
    const Session = (await import("../models/Session.js")).default;
    sessions = (await Session.find({ topic: source.topic, deleted: { $ne: true } }).select("title").lean()).sort((a, b) => naturalCompare(a.title, b.title));
  } else return [];
  const out = [];
  for (const se of sessions) {
    const qs = await Quiz.find({ session: se._id, ...live }).select("title").lean();
    qs.sort((a, b) => naturalCompare(a.title, b.title)).forEach((q) => out.push({ kind: "quiz", id: String(q._id), name: q.title || "" }));
  }
  return out;
}
const quizSource = (item, label) => ({ [item.kind]: item.id, label: [label, item.name].filter(Boolean).join(" › ") });

// Which video the next run makes (pure, tested). list = topicQuizList, counts =
// complete questions per quiz id (a function), per = questions per video.
// → { done:true } | { idx, item, start, count, part, total, nextIdx, nextStart, last, wrapped }
export function nextQuizVideo({ list = [], countOf, quizId = "", quizIdx = 0, quizStartId = "", nextStart = 1, per = 25, stopWhenExhausted = true } = {}) {
  if (!list.length) return { done: true };
  const P = Math.max(1, Math.min(MAX_LONG_VIDEO_QUESTIONS, Number(per) || MAX_LONG_VIDEO_QUESTIONS));
  const startIdx = Math.max(0, list.findIndex((q) => q.id === quizStartId));
  let idx = quizId ? list.findIndex((q) => q.id === quizId) : -1;
  if (idx < 0) idx = quizId ? Math.min(Math.max(startIdx, Number(quizIdx) || 0), list.length) : startIdx; // quiz removed → same position
  let start = quizId && list[idx]?.id === quizId ? Math.max(1, Number(nextStart) || 1) : 1;
  let wrapped = false;
  for (let guard = 0; guard <= list.length * 2; guard++) {
    if (idx >= list.length) {
      if (stopWhenExhausted || wrapped) return { done: true };
      idx = startIdx; start = 1; wrapped = true; // repeat from the start quiz
    }
    const total = Number(countOf(list[idx])) || 0;
    if (total > 0 && start <= total) {
      const count = Math.min(P, total - start + 1);
      const end = start + count - 1;
      const part = total > P ? partNumberFor(start, P) : 0;
      const moveOn = end >= total;
      return {
        idx, item: list[idx], start, count, part, total,
        nextIdx: moveOn ? idx + 1 : idx, nextStart: moveOn ? 1 : end + 1,
        last: moveOn && idx + 1 >= list.length, wrapped,
      };
    }
    idx += 1; start = 1; // empty quiz / nothing left in it → next quiz
  }
  return { done: true };
}

// What a quiz-by-quiz schedule's NEXT run would make (no side effects) — used
// by the run itself and to check a schedule before it's switched back on.
// → { list, next, startIdx }
export async function planByQuizNext(sch) {
  const lv = sch.longVideo || {};
  const o = lv.options || {};
  const list = await topicQuizList(sch.source || {});
  const counts = new Map();
  const countOf = (item) => counts.get(item.id) ?? 0;
  // Count questions lazily from the current quiz on (only what's needed).
  const startIdx = Math.max(0, list.findIndex((q) => q.id === lv.quizStartId));
  let from = lv.quizId ? list.findIndex((q) => q.id === lv.quizId) : startIdx;
  if (from < 0) from = Math.min(Math.max(startIdx, Number(lv.quizIdx) || 0), list.length);
  for (let i = from; i < list.length; i++) {
    const n = (await completeQuestionsForSource({ [list[i].kind]: list[i].id }).catch(() => [])).length;
    counts.set(list[i].id, n);
    if (n > 0 && (i > from || (Number(lv.nextStart) || 1) <= n)) break;
  }
  if (sch.stopWhenExhausted === false) {
    for (let i = startIdx; i < from; i++) if (!counts.has(list[i].id)) {
      const n = (await completeQuestionsForSource({ [list[i].kind]: list[i].id }).catch(() => [])).length;
      counts.set(list[i].id, n); if (n > 0) break;
    }
  }
  const stop = sch.stopWhenExhausted !== false;
  const next = nextQuizVideo({ list, countOf, quizId: lv.quizId, quizIdx: lv.quizIdx, quizStartId: lv.quizStartId, nextStart: lv.nextStart, per: o.count, stopWhenExhausted: stop });
  return { list, next, startIdx };
}

async function runByQuizSchedule(sch, cfg, site) {
  const lv = sch.longVideo || {};
  const o = lv.options || {};
  const stop = sch.stopWhenExhausted !== false;
  const { list, next, startIdx } = await planByQuizNext(sch);
  sch.lastRunAt = new Date();
  const totalQuizzes = Math.max(0, list.length - startIdx);
  if (next.done) {
    sch.lastResult = list.length ? `Completed — every quiz from ${list[startIdx]?.name || "the start"} to ${list[list.length - 1].name} has been made.` : "No quizzes in this topic.";
    if (list.length) { sch.completedAt = sch.completedAt || new Date(); sch.enabled = false; }
    return { ok: !!list.length, completed: !!list.length, exhausted: true, error: list.length ? undefined : sch.lastResult };
  }
  const playlist = lv.playlist === "__none__" ? null : lv.playlist?.id ? lv.playlist : undefined;
  const ytOk = !!o.toYoutube && isYoutubeConfigured(cfg);
  const fbOk = !!o.toFacebook && isFacebookConfigured(cfg);
  const skipped = [o.toYoutube && !ytOk && "YouTube", o.toFacebook && !fbOk && "Facebook"].filter(Boolean);
  if (!ytOk && !fbOk) { sch.lastResult = `Error: ${skipped.join(" and ") || "No network"} not connected.`; return { ok: false, error: sch.lastResult }; }
  try {
    queueFullQuizVideo({
      source: quizSource(next.item, sch.source?.label || ""),
      cfg, site, titleTemplate: lv.title || "", privacy: lv.privacy, hashtags: sch.hashtags || "",
      auto: true, scheduleTitle: sch.title || "", playlist, useThumbnail: lv.useThumbnail !== false,
      options: { ...o, order: "sequential", toYoutube: ytOk, toFacebook: fbOk, start: next.start, count: next.count, part: next.part },
      scheduleId: sch._id,
    });
  } catch (e) {
    sch.lastResult = `Error: ${e?.message || e}`;
    return { ok: false, error: sch.lastResult };
  }
  const nextItem = list[next.nextIdx];
  sch.longVideo = { ...lv, quizId: nextItem ? nextItem.id : "__end__", quizIdx: next.nextIdx, nextStart: next.nextStart, part: next.part };
  sch.markModified?.("longVideo");
  const which = `${next.item.name}${next.part ? ` (Part ${next.part})` : ""}`;
  sch.lastResult = `${which} — quiz ${next.idx - startIdx + 1} of ${totalQuizzes}, questions ${next.start}–${next.start + next.count - 1} of ${next.total} — is being made; you'll get an email when it's posted.${next.wrapped ? " (started again from the first quiz)" : ""}${skipped.length ? ` ${skipped.join(" and ")} skipped (not connected).` : ""}`;
  const finished = stop && next.last;
  if (finished) { sch.completedAt = sch.completedAt || new Date(); sch.enabled = false; }
  return { ok: true, completed: finished };
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
  if (sch.longVideo?.byQuiz) return runByQuizSchedule(sch, cfg, site);
  const lv = sch.longVideo || {};
  const o = lv.options || {};
  const total = (await completeQuestionsForSource(sch.source || {}).catch(() => [])).length;
  const stop = sch.stopWhenExhausted !== false;
  const next = nextLongVideoPart({ nextStart: lv.nextStart, part: lv.part, perVideo: o.count, total, order: o.order, stopWhenExhausted: stop });
  sch.lastRunAt = new Date();
  if (next.done) {
    sch.lastResult = total ? `Completed — every part of the ${total} questions has been made.` : "No complete questions in this content.";
    // Every part is already made — mark it Completed and pause it (keep it in
    // the list) rather than letting it fire again / be deleted.
    if (total) { sch.completedAt = sch.completedAt || new Date(); sch.enabled = false; }
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
  // This was the final part (the whole topic fits in / has reached this video):
  // mark the schedule Completed and pause it, but KEEP it in the list. It is NOT
  // deleted — deleting a repeating schedule on completion made it vanish after a
  // single run (confusing) and, because the video is only just now being made,
  // also lost the row that reportToSchedule updates when the video posts.
  const finished = stop && next.last && o.order !== "random";
  if (finished) { sch.completedAt = sch.completedAt || new Date(); sch.enabled = false; }
  return { ok: true, completed: finished };
}
