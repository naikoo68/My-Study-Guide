import FbSchedule from "../models/FbSchedule.js";
import Question from "../models/Question.js";
import Settings from "../models/Settings.js";
import { runScheduleOnce, getFacebookConfig, hashtagsForQuestion } from "../config/facebook.js";
import { renderQuestionImage } from "../config/socialImage.js";

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
  const kind = body.kind === "custom" ? "custom" : "question";
  const mode = body.mode === "once" ? "once" : "recurring";
  // Custom media: keep only well-formed http(s) URLs (from the Cloudinary uploader), max 10.
  const customMedia = Array.isArray(body.customMedia)
    ? body.customMedia.map((u) => String(u || "").trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 10)
    : [];
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
  };
}

// Shared validation for create/update. Returns an error message string, or "".
// Exported for unit tests (pure, no I/O).
export function validateScheduleData(data) {
  if (data.kind === "custom") {
    if (!data.customText && !data.customMedia.length) {
      return "Add some text or upload media for the custom post.";
    }
  } else if (!data.source.subject && !data.source.session && !data.source.quiz && !data.source.testSeries) {
    return "Pick a source (a subject, session, quiz or test) to draw questions from.";
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
export async function listSchedules(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const q = String(req.query.q || "").trim();
  const filter = {};
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { "source.label": rx }];
  }
  const total = await FbSchedule.countDocuments(filter);
  const items = await FbSchedule.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  res.json({ items, total, page, limit });
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

// POST /api/facebook/schedules/:id/post-now — post one question immediately (admin)
export async function postScheduleNow(req, res) {
  const sch = await FbSchedule.findById(req.params.id);
  if (!sch) return res.status(404).json({ message: "Schedule not found." });
  const cfg = await getFacebookConfig();
  if (!cfg.pageId || !cfg.token) {
    return res.status(400).json({ ok: false, error: "Connect Facebook first (Page ID + token) and enable posting." });
  }
  const result = await runScheduleOnce(sch, cfg);
  await sch.save().catch(() => {});
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
  const r = await renderQuestionImage(q, {
    includeOptions: req.body.includeOptions !== false,
    includeAnswer: !!req.body.includeAnswer,
    hashtags: String(req.body.hashtags || "").trim(),
  });
  if (!r.url) return res.status(502).json({ message: r.error || "Could not generate the image." });
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
