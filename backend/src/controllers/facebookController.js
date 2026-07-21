import FbSchedule from "../models/FbSchedule.js";
import { runScheduleOnce, getFacebookConfig } from "../config/facebook.js";

// Only the fields an admin may set on a schedule (whitelist).
function pickScheduleFields(body = {}) {
  const src = body.source || {};
  const cleanId = (v) => (v ? v : null);
  return {
    title: String(body.title || "").trim(),
    enabled: body.enabled !== false,
    source: {
      label: String(src.label || "").trim(),
      subject: cleanId(src.subject),
      session: cleanId(src.session),
      quiz: cleanId(src.quiz),
      testSeries: cleanId(src.testSeries),
    },
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
    toFacebook: body.toFacebook !== false,
    toInstagram: !!body.toInstagram,
    asImage: !!body.asImage,
  };
}

// GET /api/facebook/schedules — list all schedules (admin)
export async function listSchedules(req, res) {
  const schedules = await FbSchedule.find().sort({ createdAt: -1 }).lean();
  res.json(schedules);
}

// POST /api/facebook/schedules — create (admin)
export async function createSchedule(req, res) {
  const data = pickScheduleFields(req.body);
  if (!data.source.subject && !data.source.session && !data.source.quiz && !data.source.testSeries) {
    return res.status(400).json({ message: "Pick a source (a subject, session, quiz or test) to draw questions from." });
  }
  if (!data.times.length) return res.status(400).json({ message: "Add at least one time (HH:MM)." });
  const sch = await FbSchedule.create({ ...data, createdBy: req.user?._id || null });
  res.status(201).json(sch);
}

// PUT /api/facebook/schedules/:id — update (admin)
export async function updateSchedule(req, res) {
  const data = pickScheduleFields(req.body);
  if (!data.times.length) return res.status(400).json({ message: "Add at least one time (HH:MM)." });
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
