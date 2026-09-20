import FbSchedule from "../models/FbSchedule.js";
import Question from "../models/Question.js";
import Settings from "../models/Settings.js";
import { runScheduleOnce, getFacebookConfig, hashtagsForQuestion, getFacebookPublishedCount, countFacebookPosts } from "../config/facebook.js";
import FbPost from "../models/FbPost.js";
import { getCurrentTenantId } from "../utils/tenantContext.js";
import { renderQuestionImage } from "../config/socialImage.js";
import { renderQuestionCardShot, renderFlashcardCardShot } from "../config/cardShot.js";
import TestSeries from "../models/TestSeries.js";
import PracticeStream from "../models/PracticeStream.js";
import PracticeSubject from "../models/PracticeSubject.js";
import PracticeTopic from "../models/PracticeTopic.js";
import { isSafePublicUrl } from "../utils/urlGuard.js";
import { composeImageAudioToVideo, isCloudinaryConfigured } from "../config/cloudinary.js";

// POST /api/facebook/compose-reel  (admin) — build a vertical MP4 (a Reel) from
// a still image + an audio track, both given as PUBLIC http(s) URLs (uploaded
// via the media uploader). Returns { url } — the composed video — which the UI
// then stores as the schedule's customVideo so it posts as a real Reel to
// Facebook/Instagram through the normal Reel pipeline. Both inputs are
// SSRF-validated so the server can't be pointed at internal addresses.
export async function composeReel(req, res) {
  const imageUrl = String(req.body?.imageUrl || "").trim();
  const audioUrl = String(req.body?.audioUrl || "").trim();
  if (!imageUrl || !audioUrl) {
    return res.status(400).json({ message: "An image and an audio file are both required to build a Reel." });
  }
  if (!/^https?:\/\//i.test(imageUrl) || !isSafePublicUrl(imageUrl)) {
    return res.status(400).json({ message: "The image URL is not a valid public link." });
  }
  if (!/^https?:\/\//i.test(audioUrl) || !isSafePublicUrl(audioUrl)) {
    return res.status(400).json({ message: "The audio URL is not a valid public link." });
  }
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({ message: "Media processing isn't set up yet (Cloudinary keys missing)." });
  }
  try {
    const { url, duration } = await composeImageAudioToVideo({ imageUrl, audioUrl });
    return res.json({ url, duration });
  } catch (err) {
    return res.status(502).json({ message: err?.message || "Could not build the Reel video." });
  }
}

// GET /api/facebook/suggest-tags/:id — hashtags for one question (global default
// + auto tags from its subject/topic/section). Used to pre-fill the post modal.
export async function suggestTags(req, res) {
  const q = await Question.findById(req.params.id).lean();
  if (!q) return res.json({ hashtags: "" });
  const site = await Settings.findOne({ key: "site" }).lean().catch(() => null);
  res.json({ hashtags: await hashtagsForQuestion(q, site, "") });
}

// Common post-format fields from the per-question modal.
function postOpts(body = {}) {
  return {
    // "flashcard" posts the two-panel flashcard image (question + answer on the
    // uploaded template); "question" posts the normal question card.
    kind: body.kind === "flashcard" ? "flashcard" : "question",
    toFacebook: body.toFacebook !== false,
    toInstagram: !!body.toInstagram,
    asImage: !!body.asImage,
    includeOptions: body.includeOptions !== false,
    includeAnswer: !!body.includeAnswer,
    includeLink: !!body.includeLink,
    hashtags: String(body.hashtags || "").trim(),
    // Pre-captured, client-rendered screenshot (exactly what students see). When
    // present the poster uses it instead of the server-drawn card.
    imageUrl: String(body.imageUrl || "").trim(),
  };
}

// Only the fields an admin may set on a schedule (whitelist).
// Exported for unit tests (pure, no I/O).
export function pickScheduleFields(body = {}) {
  const src = body.source || {};
  const cleanId = (v) => (v ? v : null);
  const kind = ["custom", "flashcard"].includes(body.kind) ? body.kind : "question";
  const mode = body.mode === "once" ? "once" : "recurring";
  // Custom media: keep only well-formed http(s) URLs (from the Cloudinary uploader), max 10.
  const customMedia = Array.isArray(body.customMedia)
    ? body.customMedia.map((u) => String(u || "").trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 10)
    : [];
  // Custom video (for a Reel post): a single public http(s) URL, else dropped.
  const rawVideo = String(body.customVideo || "").trim();
  const customVideo = /^https?:\/\//i.test(rawVideo) && isSafePublicUrl(rawVideo) ? rawVideo : "";
  // Reel music track (for question/flashcard Reels): a single public http(s) URL.
  const rawAudio = String(body.customAudio || "").trim();
  const customAudio = /^https?:\/\//i.test(rawAudio) && isSafePublicUrl(rawAudio) ? rawAudio : "";
  return {
    title: String(body.title || "").trim(),
    enabled: body.enabled !== false,
    kind,
    source: {
      label: String(src.label || "").trim(),
      subject: cleanId(src.subject),
      session: cleanId(src.session),
      quiz: cleanId(src.quiz),
      testSeries: cleanId(src.testSeries),
    },
    customText: String(body.customText || "").trim().slice(0, 5000),
    customMedia,
    customVideo,
    mode,
    // One-off run time (only meaningful when mode === "once").
    runAt: mode === "once" && body.runAt && !isNaN(new Date(body.runAt).getTime()) ? new Date(body.runAt) : null,
    times: Array.isArray(body.times)
      ? body.times.map((t) => String(t).trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).slice(0, 20)
      : [],
    days: Array.isArray(body.days) ? body.days.map(Number).filter((d) => d >= 0 && d <= 6) : [],
    timezone: String(body.timezone || "Asia/Kolkata").trim() || "Asia/Kolkata",
    includeOptions: body.includeOptions !== false,
    includeAnswer: !!body.includeAnswer,
    includeLink: !!body.includeLink,
    hashtags: String(body.hashtags || "").trim(),
    order: body.order === "sequential" ? "sequential" : "random",
    stopWhenExhausted: body.stopWhenExhausted !== false, // default true: stop once every question posted
    toFacebook: body.toFacebook !== false,
    toInstagram: !!body.toInstagram,
    asImage: !!body.asImage,
    // Post question/flashcard runs as a Reel by mixing the card image with music.
    asReel: !!body.asReel,
    customAudio,
  };
}

// Shared validation for create/update. Returns an error message string, or "".
// Exported for unit tests (pure, no I/O).
export function validateScheduleData(data) {
  if (data.kind === "custom") {
    if (!data.customText && !data.customMedia.length && !data.customVideo) {
      return "Add some text, upload an image, or add a video (Reel) for the custom post.";
    }
  } else if (!data.source.subject && !data.source.session && !data.source.quiz && !data.source.testSeries) {
    return "Pick a source (a subject, session, quiz or test) to draw questions from.";
  }
  // Reel mode for question/flashcard needs a music track to mix with the card.
  if (data.asReel && data.kind !== "custom" && !data.customAudio) {
    return "Add a music track (audio) to post the question/flashcard as a Reel.";
  }
  if (data.mode === "once") {
    if (!data.runAt) return "Pick a valid date & time for the one-off post.";
  } else if (!data.times.length) {
    return "Add at least one time (HH:MM).";
  }
  return "";
}

// GET /api/facebook/schedules — list schedules (admin), paginated + searchable.
// Query: ?page=1&limit=20&q=<title/source search>. Returns { items, total,
// page, limit } so the admin panel can page through 100s of schedules.
// "8:00" / "08:00" → minutes since midnight (0–1439), or null if invalid.
function hhmmToMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// The minute-of-day value(s) at which a schedule fires — its recurring `times`,
// or the one-off `runAt` converted to the schedule's own timezone. Used for the
// time-of-day filter and sort.
function scheduleFireMinutes(sch) {
  if (sch.mode === "once") {
    if (!sch.runAt) return [];
    try {
      const f = new Intl.DateTimeFormat("en-GB", { timeZone: sch.timezone || "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" });
      const p = Object.fromEntries(f.formatToParts(new Date(sch.runAt)).map((x) => [x.type, x.value]));
      const h = p.hour === "24" ? 0 : +p.hour;
      return [h * 60 + (+p.minute)];
    } catch { return []; }
  }
  return (sch.times || []).map(hhmmToMin).filter((m) => m != null);
}

// GET /api/facebook/schedules — list schedules (admin), paginated + searchable.
// Query: ?page=1&limit=20&q=<search>&from=HH:MM&to=HH:MM&sort=recent|time.
//   from/to  — keep only schedules that fire within this time-of-day window
//              (wrapping past midnight is supported, e.g. 22:00→01:00). Also
//              returns postsInRange = how many individual posts fall in it.
//   sort     — "time" orders by earliest fire time of day; default is newest first.
export async function listSchedules(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const q = String(req.query.q || "").trim();
  const filter = {};
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { "source.label": rx }];
  }

  const fromMin = hhmmToMin(req.query.from);
  const toMin = hhmmToMin(req.query.to);
  const rangeActive = fromMin != null && toMin != null;
  const sort = req.query.sort === "time" ? "time" : "recent";

  // Fast path (no time filter/sort): let the DB paginate, as before.
  if (!rangeActive && sort !== "time") {
    const total = await FbSchedule.countDocuments(filter);
    const items = await FbSchedule.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return res.json({ items, total, page, limit });
  }

  // Time filter / sort-by-time need every field, so load the search-matched set
  // and do it in memory (schedule counts are modest, and each doc is small).
  let all = await FbSchedule.find(filter).lean();
  let postsInRange = 0;
  if (rangeActive) {
    const inRange = (m) => (fromMin <= toMin ? m >= fromMin && m <= toMin : m >= fromMin || m <= toMin);
    all = all.filter((s) => {
      const hits = scheduleFireMinutes(s).filter(inRange);
      postsInRange += hits.length;
      return hits.length > 0;
    });
  }
  const earliest = (s) => { const mins = scheduleFireMinutes(s); return mins.length ? Math.min(...mins) : Infinity; };
  all.sort(sort === "time"
    ? (a, b) => earliest(a) - earliest(b) || new Date(b.createdAt) - new Date(a.createdAt)
    : (a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = all.length;
  const items = all.slice((page - 1) * limit, (page - 1) * limit + limit);
  res.json({ items, total, page, limit, ...(rangeActive ? { postsInRange } : {}) });
}

// GET /api/facebook/stats — reliable LIFETIME Facebook publication count + a few
// recent entries, read from the permanent ledger (FbPost). This survives schedule
// deletion, unlike a schedule's own postCount.
export async function facebookStats(req, res) {
  // Scope to the tenant's CURRENTLY connected Page so one Page's (or tenant's)
  // posts never inflate another's count. Both "lifetime" here and the
  // reconciliation's applicationCount resolve through the SAME authoritative
  // function, countFacebookPosts(tenantId, pageId) — never a second counter.
  const cfg = await getFacebookConfig();
  const pageId = cfg.pageId || "";
  const tenantId = getCurrentTenantId();
  const [lifetime, recent] = await Promise.all([
    countFacebookPosts(tenantId, pageId),
    FbPost.find(pageId ? { pageId } : {}).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  res.json({
    lifetime,
    pageId,
    recent: recent.map((p) => ({
      facebookPostId: p.facebookPostId,
      pageLabel: p.pageLabel || "",
      scheduleTitle: p.scheduleTitle || "",
      sourceLabel: p.sourceLabel || "",
      kind: p.kind || "question",
      postedAt: p.createdAt,
    })),
  });
}

// GET /api/facebook/reconcile — DIAGNOSTIC ONLY. Reports our authoritative
// application count (the FbPost ledger) alongside the remote figure Meta's API
// returns for the connected Page, so an admin can SPOT drift. It never mutates
// the application count: the remote number is NOT imported, NOT treated as our
// lifetime total, and NOT treated as the Page's authoritative post count. The
// remote value is Meta's published_posts.summary.total_count — a remote summary
// that also includes posts made outside this application (see
// FACEBOOK_COUNT_ARCHITECTURE.md).
export async function reconcileFacebook(req, res) {
  const cfg = await getFacebookConfig();
  const tenantId = getCurrentTenantId();
  // Authoritative application count — the SAME source as "Published by this
  // application". Read-only.
  const applicationCount = await countFacebookPosts(tenantId, cfg.pageId || "");
  const lastReconciledAt = new Date().toISOString();

  // Base diagnostic payload. `remoteOnly` / `ledgerOnly` are only knowable from
  // an enumerated remote id list; the current Meta request returns a summary
  // total only, so they are reported as null (undetermined) rather than guessed.
  const base = {
    applicationCount,
    remoteApiCount: null,
    remoteOnly: null,
    ledgerOnly: null,
    drift: null,
    lastReconciledAt,
    remoteCountKind: "meta_published_posts_summary_total_count",
    note: "Remote count is a non-authoritative Meta summary that also includes posts published outside this application. It is not the application's lifetime count.",
    // Back-compat aliases for existing clients.
    ours: applicationCount,
    facebook: null,
  };

  if (!cfg.pageId || !cfg.token) {
    return res.json({ ...base, status: "remote_unavailable", error: "Connect Facebook first (Page ID + token)." });
  }

  const r = await getFacebookPublishedCount(cfg);
  if (!r.ok || typeof r.count !== "number") {
    return res.json({ ...base, status: "remote_unavailable", error: r.error || "Facebook count unavailable." });
  }

  const remoteApiCount = r.count;
  const drift = remoteApiCount - applicationCount;
  res.json({
    ...base,
    remoteApiCount,
    facebook: remoteApiCount, // back-compat alias
    drift,
    status: drift === 0 ? "in_sync" : "drift_detected",
  });
}

// POST /api/facebook/schedules — create (admin)
export async function createSchedule(req, res) {
  const data = pickScheduleFields(req.body);
  const err = validateScheduleData(data);
  if (err) return res.status(400).json({ message: err });
  const sch = await FbSchedule.create({ ...data, createdBy: req.user?._id || null });
  res.status(201).json(sch);
}

// PUT /api/facebook/schedules/:id — update (admin)
export async function updateSchedule(req, res) {
  const data = pickScheduleFields(req.body);
  const err = validateScheduleData(data);
  if (err) return res.status(400).json({ message: err });
  const sch = await FbSchedule.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!sch) return res.status(404).json({ message: "Schedule not found." });
  res.json(sch);
}

// DELETE /api/facebook/schedules/:id — delete (admin)
export async function deleteSchedule(req, res) {
  await FbSchedule.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}

// Rebuild the "My Quiz › Stream › Subject › Topic › Item" breadcrumb for a
// practice (My Quiz) source from the live hierarchy. Older schedules stored a
// label built before the TOPIC level was included, so it was missing; this
// re-derives the full trail. Returns the corrected label, or "" when it can't
// / shouldn't be rebuilt (e.g. the source isn't a My Quiz item).
async function rebuildPracticeLabel(source = {}) {
  if (!source.testSeries) return "";
  const ts = await TestSeries.findById(source.testSeries)
    .select("name practice practiceStream practiceSubject practiceTopic")
    .lean()
    .catch(() => null);
  if (!ts || !ts.practice) return ""; // only My Quiz items; leave anything else untouched
  const [stream, subject, topic] = await Promise.all([
    ts.practiceStream ? PracticeStream.findById(ts.practiceStream).select("name").lean().catch(() => null) : null,
    ts.practiceSubject ? PracticeSubject.findById(ts.practiceSubject).select("name").lean().catch(() => null) : null,
    ts.practiceTopic ? PracticeTopic.findById(ts.practiceTopic).select("name").lean().catch(() => null) : null,
  ]);
  return ["My Quiz", stream?.name, subject?.name, topic?.name, ts.name].filter(Boolean).join(" › ");
}

// POST /api/facebook/schedules/backfill-labels — one-off maintenance (admin).
// Re-derives the source breadcrumb for existing "My Quiz" schedules so the
// TOPIC level (dropped by schedules created before it was included) shows again.
// Idempotent: only rows whose label actually changed are written. Quiz-Bank,
// custom and single-question schedules are left untouched.
export async function backfillScheduleLabels(req, res) {
  const schedules = await FbSchedule.find({}).select("source kind").lean();
  let updated = 0;
  for (const s of schedules) {
    if (s.kind === "custom" || !s.source?.testSeries || s.source?.question) continue;
    const label = await rebuildPracticeLabel(s.source);
    if (label && label !== s.source?.label) {
      // Write back the WHOLE source (spread) so every existing id is preserved
      // and we avoid engine-specific dotted-path update quirks.
      await FbSchedule.updateOne({ _id: s._id }, { $set: { source: { ...s.source, label } } }).catch(() => {});
      updated += 1;
    }
  }
  res.json({ ok: true, scanned: schedules.length, updated });
}

// POST /api/facebook/schedules/:id/post-now — post one question immediately (admin)
export async function postScheduleNow(req, res) {
  const sch = await FbSchedule.findById(req.params.id);
  if (!sch) return res.status(404).json({ message: "Schedule not found." });
  const cfg = await getFacebookConfig();
  if (!cfg.pageId || !cfg.token) {
    return res.status(400).json({ ok: false, error: "Connect Facebook first (Page ID + token) and enable posting." });
  }
  const result = await runScheduleOnce(sch, cfg);
  // Disappear-on-success: remove a one-time post, or a recurring schedule that
  // just finished its whole pool, once it has published successfully. Failures
  // are kept so the admin can retry.
  if (result.ok && (sch.mode === "once" || result.completed)) {
    await FbSchedule.deleteOne({ _id: sch._id }).catch(() => {});
  } else {
    await sch.save().catch(() => {});
  }
  return res.status(result.ok ? 200 : 502).json(result);
}

// POST /api/facebook/post-question — post ONE specific question right now (admin)
// Body: { questionId, toFacebook?, toInstagram?, asImage?, includeOptions?, includeAnswer?, hashtags? }
export async function postQuestionNow(req, res) {
  const questionId = req.body?.questionId;
  if (!questionId) return res.status(400).json({ ok: false, error: "Missing questionId." });
  const cfg = await getFacebookConfig();
  if (!cfg.pageId || !cfg.token) return res.status(400).json({ ok: false, error: "Connect Facebook first (Page ID + token) and enable posting." });
  const exists = await Question.exists({ _id: questionId });
  if (!exists) return res.status(404).json({ ok: false, error: "Question not found." });

  // A transient (unsaved) schedule-like object drives the same posting logic.
  const transient = { source: { question: questionId }, order: "random", postedQuestionIds: [], ...postOpts(req.body) };
  const result = await runScheduleOnce(transient, cfg);
  return res.status(result.ok ? 200 : 502).json(result);
}

// POST /api/facebook/preview-image — render the question card image and return
// its URL (no posting). Used for the live preview in the post/schedule modal.
export async function previewQuestionImage(req, res) {
  const { questionId } = req.body || {};
  if (!questionId) return res.status(400).json({ message: "Missing questionId." });
  const q = await Question.findById(questionId).lean();
  if (!q) return res.status(404).json({ message: "Question not found." });

  const includeAnswer = !!req.body.includeAnswer;
  const hashtags = String(req.body.hashtags || "").trim();
  const site = await Settings.findOne({ key: "site" }).lean().catch(() => null);

  // Flashcard image (for the admin's Flashcard Details "Download") — the SAME
  // two-panel flashcard the auto-post produces, on the uploaded template.
  if (req.body.kind === "flashcard") {
    const templateUrl = site?.fbFlashcardTemplateEnabled !== false ? String(site?.fbFlashcardTemplateUrl || "").trim() : "";
    const fc = await renderFlashcardCardShot(q, { templateUrl }).catch((e) => ({ error: e?.message || String(e) }));
    if (fc?.url) return res.json({ url: fc.url });
    return res.status(502).json({ message: fc?.error || "Could not generate the flashcard image." });
  }

  // Preview the SAME image that actually gets posted: a screenshot of the REAL
  // /q-card page (pixel-identical to the on-screen quiz card and to what the
  // auto-post schedule posts), with the same selfie/text watermarks baked in.
  // Fall back to the lightweight SVG card ONLY if the headless screenshot is
  // unavailable, so the preview never simply fails.
  const selfieOn = site?.fbSelfieWatermarkEnabled !== false && !!site?.fbSelfieWatermarkUrl;
  const textWmText = String(site?.fbTextWatermarkText || site?.watermarkText || site?.siteName || "").trim();
  const textOn = site?.fbTextWatermarkEnabled === true && !!textWmText;

  const shot = await renderQuestionCardShot(q, {
    includeAnswer,
    cta: !includeAnswer, // "Comment your answer!" when the answer is hidden — mirrors the post
    watermark: selfieOn
      ? {
          url: site.fbSelfieWatermarkUrl,
          size: site.fbSelfieWatermarkSize || 120,
          opacity: site.fbSelfieWatermarkOpacity || 90,
          position: site.fbSelfieWatermarkPosition || "bottom-right",
          shape: site.fbSelfieWatermarkShape || "circle",
        }
      : null,
    textWatermark: textOn
      ? { text: textWmText, size: site.fbTextWatermarkSize || 64, opacity: site.fbTextWatermarkOpacity || 12 }
      : null,
  }).catch((e) => ({ error: e?.message || String(e) }));
  if (shot?.url) return res.json({ url: shot.url });

  // Fallback: server-drawn SVG card (also honours the "Show options" toggle).
  const r = await renderQuestionImage(q, {
    includeOptions: req.body.includeOptions !== false,
    includeAnswer,
    hashtags,
  });
  if (!r.url) return res.status(502).json({ message: r.error || shot?.error || "Could not generate the image." });
  res.json({ url: r.url });
}

// POST /api/facebook/schedule-question — schedule ONE specific question at a
// date/time (admin). Body: { questionId, runAt, label?, ...postOpts }
export async function scheduleQuestion(req, res) {
  const { questionId, runAt } = req.body || {};
  if (!questionId) return res.status(400).json({ message: "Missing questionId." });
  if (!runAt || isNaN(new Date(runAt).getTime())) return res.status(400).json({ message: "Pick a valid date & time." });
  const exists = await Question.exists({ _id: questionId });
  if (!exists) return res.status(404).json({ message: "Question not found." });

  const sch = await FbSchedule.create({
    title: String(req.body.title || "").trim() || "Scheduled question",
    enabled: true,
    mode: "once",
    runAt: new Date(runAt),
    source: { question: questionId, label: String(req.body.label || "Single question").slice(0, 120) },
    times: [], days: [], timezone: String(req.body.timezone || "Asia/Kolkata"),
    order: "random",
    ...postOpts(req.body), // includes the pre-captured imageUrl (posted at run time)
    createdBy: req.user?._id || null,
  });
  res.status(201).json(sch);
}
