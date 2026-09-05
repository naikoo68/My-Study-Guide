import Stream from "../models/Stream.js";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";
import Session from "../models/Session.js";
import Quiz from "../models/Quiz.js";
import Question from "../models/Question.js";
import TestSeries from "../models/TestSeries.js";
import { notifyNewContent } from "../utils/notify.js";
import { ownerValue, ownerFilter, isClient } from "../utils/ownership.js";
import { duplicateQuestions } from "../utils/duplicateQuestions.js";
import { byNatural } from "../utils/naturalSort.js";
import { NOT_DELETED, softDeletePatch } from "../utils/softDelete.js";
import { sanitizeBody, ALLOW } from "../utils/sanitizeBody.js";
import { normName } from "../utils/conceptDedupe.js";
import { platformContentFilter } from "../utils/platformScope.js";
import { runUnscoped, getCurrentTenantId, getShareContent } from "../utils/tenantContext.js";

const slugify = (s) =>
  String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------------- Banner images (streams & subjects) ----------------
 *
 * Stream/Subject banners are stored as base64 `data:` URIs on the `image`
 * field. Returning them inline in the LIST endpoints made those responses
 * multi-megabyte (a dozen streams ≈ 7 MB), so every "browse" page stalled on
 * "Loading streams…" while the browser dragged the whole blob down.
 *
 * Fix: the list endpoints replace a heavy `data:` URI with a small URL that
 * points at the dedicated image endpoints below (`serveContentImage`). The
 * browser then loads each banner as a normal, cacheable `<img>` request — in
 * parallel and non-blocking — instead of bloating the JSON. The field name
 * stays `image`, so every `<img src={…}>` consumer keeps working unchanged.
 */

// Absolute URL to a banner image endpoint. Absolute (not relative) because the
// `<img>` renders on the FRONTEND origin (e.g. www.mystudyguide.in) while the
// API lives on another host (e.g. api.mystudyguide.in). `trust proxy` is set,
// so req.protocol / req.get("host") reflect the real public scheme + host.
// A `?v=<updatedAt>` cache-buster makes the URL change whenever the banner does,
// which lets the endpoint serve it as immutable (cached forever by the browser).
function imageEndpointUrl(req, kind, id, updatedAt) {
  const base = `${req.protocol}://${req.get("host")}`;
  const v = updatedAt ? `?v=${new Date(updatedAt).getTime()}` : "";
  return `${base}/api/${kind}/${id}/image${v}`;
}

// True for our own image-endpoint URL — used to guard updates from clobbering
// the stored banner when the admin form echoes the list value back on save.
const IMAGE_ENDPOINT_RE = /\/(streams|subjects)\/[^/]+\/image(\?|$)/;

// Swap a heavy base64 `data:` URI on a lean doc for a small image-endpoint URL.
// Non-data-URI images (already-small external URLs) and empty values pass
// through untouched, so nothing changes for streams that store a plain URL.
function withLiteImage(doc, kind, req) {
  if (typeof doc.image === "string" && doc.image.startsWith("data:")) {
    return { ...doc, image: imageEndpointUrl(req, kind, String(doc._id), doc.updatedAt) };
  }
  return doc;
}

// When an admin saves a stream/subject, drop `image` from the update if it's the
// lightweight endpoint URL we handed the client in the list (i.e. the banner was
// NOT changed) — otherwise the stored data URI would be overwritten with a
// pointer to itself and the real image would be lost. A genuine change is always
// a `data:` URI (new upload / AI) or "" (explicit Remove), both of which pass.
function stripEchoedImage(data) {
  if (typeof data.image === "string" && IMAGE_ENDPOINT_RE.test(data.image)) {
    delete data.image;
  }
  return data;
}

// GET /api/streams/:id/image and /api/subjects/:id/image — serve a stored banner
// as a real, cacheable image so it stays OUT of the JSON list responses.
function makeImageHandler(Model, label) {
  return async function serveContentImage(req, res) {
    // Look up UNSCOPED by unique id: banners are public content shown on public
    // pages, and a plain <img> request carries no tenant header (so tenant
    // scoping would otherwise 404 an institute's own banner). Serving a public
    // banner by id leaks nothing sensitive.
    const doc = await runUnscoped(() =>
      Model.findById(req.params.id).select("image updatedAt").lean()
    );
    const img = doc?.image || "";
    if (!img) return res.status(404).end();
    // Legacy: a plain external URL was stored instead of a data URI — redirect.
    if (!img.startsWith("data:")) return res.redirect(302, img);
    const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(img);
    if (!m) return res.status(404).end();
    const contentType = m[1] || "application/octet-stream";
    const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
    // The ?v=<updatedAt> query makes each URL content-stable, so cache hard.
    const etag = `"${label}-${req.params.id}-${doc.updatedAt ? new Date(doc.updatedAt).getTime() : buf.length}"`;
    // Allow the banner to be embedded from the FRONTEND origin (e.g. www.*),
    // which is cross-origin to this API (api.*). helmet() sets a global
    // Cross-Origin-Resource-Policy: same-origin, which makes the browser BLOCK
    // a cross-origin <img> and render a blank banner. These are public images
    // meant to be shown anywhere, so override CORP to cross-origin. (Set before
    // the 304 return so conditional responses carry it too.)
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("ETag", etag);
    res.type(contentType);
    return res.send(buf);
  };
}

export const streamImage = makeImageHandler(Stream, "stream");
export const subjectImage = makeImageHandler(Subject, "subject");

// Admins / institute-admins see EVERYTHING (including items they've disabled);
// students & the public never see DISABLED items. Applied to the shared list
// endpoints (which are the same for admin and public). Requires the route to
// use optionalAuth so req.user is populated when a token is present.
const isAdminReq = (req) => !!req.user && (req.user.role === "admin" || req.user.role === "institute_admin");
// Disabled items are hidden from the PUBLIC site for EVERYONE — including an
// admin who happens to be browsing the public pages while logged in. The admin
// CONTENT MANAGER loads them explicitly by passing ?manage=1, so it can still
// show disabled items (with a "Disabled" tag) and re-enable them. So: only an
// admin request that explicitly asks to manage sees disabled content.
const visFilter = (req) => (isAdminReq(req) && req.query?.manage === "1" ? {} : { disabled: { $ne: true } });

// Build a URL-safe slug that is GUARANTEED non-empty and NOT already taken by
// another live (non-deleted) record of the same Model.
//
// Why this exists: Stream/Subject both declare `slug` as required + unique. Two
// real-world inputs used to break creation on the DynamoDB engine:
//   1) a name with no [a-z0-9] characters (e.g. a non-Latin script) → slugify()
//      returns "" → the required-slug validation rejects the create.
//   2) two different names that slugify to the same value (or a name whose slug
//      already exists) → the unique-slug check throws a raw E11000.
// This helper falls back to a stable token when empty, and appends -2, -3, …
// until the slug is free — so a legitimate new record is never rejected.
async function uniqueSlug(Model, name, excludeId = null) {
  let base = slugify(name);
  if (!base) base = `item-${Date.now().toString(36)}`;
  let candidate = base;
  let n = 1;
  // Small tables (streams/subjects) — a findOne per attempt is cheap.
  for (;;) {
    const existing = await Model.findOne({ slug: candidate, deleted: { $ne: true } }).lean();
    if (!existing || String(existing._id) === String(excludeId)) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

// Reject a duplicate NAME up-front with a CLEAR message (instead of a cryptic
// E11000). Only live (non-deleted) records count — a name sitting in the
// Recycle Bin can be re-used. Returns null when the name is free, or a
// ready-to-send { status, message } when it's taken.
async function nameTaken(Model, name, label, excludeId = null) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const existing = await Model.findOne({ name: trimmed, deleted: { $ne: true } }).lean();
  if (existing && String(existing._id) !== String(excludeId)) {
    return { status: 409, message: `A ${label} named “${trimmed}” already exists. Pick a different name or edit the existing one.` };
  }
  return null;
}

/* ---------------- Per-subject content counts (cached) ----------------
 *
 * The topic / quiz / question totals shown on stream & subject cards are
 * computed by grouping the WHOLE Topic/Quiz/Question collections by subject.
 * The Question group alone scans a ~57k-row table and was ~0.9 s of server time
 * on EVERY streams/subjects list load (the "Loading streams…" wait) — even
 * though the counts are decorative and change slowly.
 *
 * So cache the three aggregations for a short TTL. The cache key includes the
 * tenant id AND its content-sharing flag because the aggregations are
 * tenant-scoped (see models/plugins/tenantId.js) — the result differs per
 * institute, so a global cache would leak counts across tenants. Trade-off: a
 * newly added quiz/question can take up to COUNTS_TTL_MS to show in the card
 * totals; acceptable for a decorative number and a big latency win.
 */
const COUNTS_TTL_MS = 60 * 1000;
const _countsCache = new Map(); // key -> { at, topicAgg, quizAgg, questionAgg }

async function getSubjectContentCounts() {
  const key = `${getCurrentTenantId() || "none"}:${getShareContent()}`;
  const hit = _countsCache.get(key);
  if (hit && Date.now() - hit.at < COUNTS_TTL_MS) return hit;
  const [topicAgg, quizAgg, questionAgg] = await Promise.all([
    Topic.aggregate([{ $match: { deleted: { $ne: true } } }, { $group: { _id: "$subject", count: { $sum: 1 } } }]),
    Quiz.aggregate([{ $match: { deleted: { $ne: true } } }, { $group: { _id: "$subject", count: { $sum: 1 } } }]),
    // Only questions that live inside a quiz (test-series questions have no quiz).
    Question.aggregate([{ $match: { quiz: { $ne: null }, deleted: { $ne: true } } }, { $group: { _id: "$subject", count: { $sum: 1 } } }]),
  ]);
  const entry = { at: Date.now(), topicAgg, quizAgg, questionAgg };
  _countsCache.set(key, entry);
  return entry;
}

/* ---------------- Streams (top level) ---------------- */

// GET /api/streams — includes subject count per stream
export async function listStreams(req, res) {
  // Super-admin browses unscoped; restrict to the platform's OWN streams so
  // institutes' shared copies don't leak into the admin's content library.
  const streams = await Stream.find({ isActive: true, ...NOT_DELETED, ...visFilter(req), ...(await platformContentFilter(req)) }).sort("order name").lean();

  // Per-stream size, shown on each stream card: subjects / topics / quizzes /
  // questions. We first map every subject to its HOME stream (a tenant-scoped
  // find, so cross-tenant data can never leak in), then roll up the lower-level
  // counts by that map — a subject id is globally unique, so only THIS request's
  // subjects contribute, even though the aggregates group across the collection.
  // Counts follow the same "home stream" rule as the subjects count.
  const subjectDocs = await Subject.find({ stream: { $ne: null }, deleted: { $ne: true } }).select("_id stream").lean();
  const subjectStream = new Map(subjectDocs.map((s) => [String(s._id), String(s.stream)]));

  const { topicAgg, quizAgg, questionAgg } = await getSubjectContentCounts();

  const subjects = {};
  for (const streamId of subjectStream.values()) subjects[streamId] = (subjects[streamId] || 0) + 1;
  const rollup = (agg) => {
    const out = {};
    for (const row of agg) {
      const streamId = subjectStream.get(String(row._id));
      if (streamId) out[streamId] = (out[streamId] || 0) + (row.count || 0);
    }
    return out;
  };
  const topics = rollup(topicAgg);
  const quizzes = rollup(quizAgg);
  const questions = rollup(questionAgg);

  res.json(
    streams.map((s) => {
      const id = String(s._id);
      return {
        ...withLiteImage(s, "streams", req),
        subjects: subjects[id] || 0,
        topics: topics[id] || 0,
        quizzes: quizzes[id] || 0,
        questions: questions[id] || 0,
      };
    })
  );
}

export async function createStream(req, res) {
  const { name } = req.body;
  const taken = await nameTaken(Stream, name, "stream");
  if (taken) return res.status(taken.status).json({ message: taken.message });
  const stream = await Stream.create({ ...sanitizeBody(req.body, { allow: ALLOW.STREAM }), slug: await uniqueSlug(Stream, name) });
  res.status(201).json(stream);
}

export async function updateStream(req, res) {
  const data = stripEchoedImage(sanitizeBody(req.body, { allow: ALLOW.STREAM }));
  if (data.name) {
    const taken = await nameTaken(Stream, data.name, "stream", req.params.id);
    if (taken) return res.status(taken.status).json({ message: taken.message });
    data.slug = await uniqueSlug(Stream, data.name, req.params.id);
  }
  const stream = await Stream.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!stream) return res.status(404).json({ message: "Stream not found" });
  res.json(stream);
}

// Soft delete (Recycle Bin): flag the stream as deleted. Its subjects/topics/
// sessions/quizzes/questions are left intact but become unreachable (you reach
// them only by navigating into the now-hidden stream), so restoring the stream
// brings its whole tree back. A permanent delete from the Recycle Bin does the
// real cascade removal.
export async function deleteStream(req, res) {
  const stream = await Stream.findByIdAndUpdate(req.params.id, softDeletePatch(), { new: true });
  if (!stream) return res.status(404).json({ message: "Stream not found" });
  res.json({ message: "Stream moved to Recycle Bin", softDeleted: true });
}

// GET /api/streams/:streamId/subjects — subjects in a stream, with topic counts
export async function listStreamSubjects(req, res) {
  const sid = req.params.streamId;
  // Match subjects whose HOME stream is this one, OR that are LINKED here via
  // `streams[]` (reused from another stream). Linked subjects show under this
  // stream but open in their home stream.
  const subjects = await Subject.find({ $or: [{ stream: sid }, { streams: sid }], isActive: true, ...NOT_DELETED, ...visFilter(req) }).sort("name").lean();
  const liteSub = (s) => withLiteImage(s, "subjects", req);
  const ids = subjects.map((s) => s._id);
  // subject/quiz are denormalised on their descendants, so each count is one
  // grouped scan; questions are limited to quiz questions (test-series excluded),
  // matching the stream-card counts.
  const [topics, quizzes, questions] = await Promise.all([
    Topic.aggregate([{ $match: { subject: { $in: ids }, deleted: { $ne: true } } }, { $group: { _id: "$subject", count: { $sum: 1 } } }]),
    Quiz.aggregate([{ $match: { subject: { $in: ids }, deleted: { $ne: true } } }, { $group: { _id: "$subject", count: { $sum: 1 } } }]),
    Question.aggregate([{ $match: { subject: { $in: ids }, quiz: { $ne: null }, deleted: { $ne: true } } }, { $group: { _id: "$subject", count: { $sum: 1 } } }]),
  ]);
  const toMap = (agg) => Object.fromEntries(agg.map((r) => [String(r._id), r.count]));
  const tMap = toMap(topics), qzMap = toMap(quizzes), qMap = toMap(questions);
  res.json(subjects.map((s) => ({ ...liteSub(s), topics: tMap[String(s._id)] || 0, quizzes: qzMap[String(s._id)] || 0, questions: qMap[String(s._id)] || 0 })));
}

async function countMap(Model, matchIds, field) {
  const rows = await Model.aggregate([
    { $match: { [field]: { $in: matchIds }, deleted: { $ne: true } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
}

/* ---------------- Subjects ---------------- */

// GET /api/subjects — includes topic count per subject
export async function listSubjects(req, res) {
  const subjects = await Subject.find({ isActive: true, ...NOT_DELETED, ...visFilter(req), ...(await platformContentFilter(req)) }).sort("name").lean();
  const liteSub = (s) => withLiteImage(s, "subjects", req);
  const { topicAgg: topics, quizAgg: quizzes, questionAgg: questions } = await getSubjectContentCounts();
  const toMap = (agg) => Object.fromEntries(agg.map((r) => [String(r._id), r.count]));
  const tMap = toMap(topics), qzMap = toMap(quizzes), qMap = toMap(questions);
  res.json(subjects.map((s) => ({ ...liteSub(s), topics: tMap[String(s._id)] || 0, quizzes: qzMap[String(s._id)] || 0, questions: qMap[String(s._id)] || 0 })));
}

export async function createSubject(req, res) {
  const { name } = req.body;
  const trimmed = String(name || "").trim();
  const targetStream = req.body?.stream ? String(req.body.stream) : null;

  // REUSE ACROSS STREAMS: if a live subject with this name already exists under
  // a DIFFERENT stream, don't create a duplicate — LINK it to this stream (add
  // to its `streams[]`) and return the existing subject so its topics/quizzes/
  // questions stay shared. Opening it later lands on its HOME stream. A true
  // duplicate WITHIN the same stream (or already linked here) is still a 409.
  const existing = trimmed ? await Subject.findOne({ name: trimmed, deleted: { $ne: true } }) : null;
  if (existing) {
    const home = String(existing.stream || "");
    const linkedTo = (existing.streams || []).map((s) => String(s));
    const alreadyHere = !targetStream || home === targetStream || linkedTo.includes(targetStream);
    if (alreadyHere) {
      return res.status(409).json({ message: `A subject named “${trimmed}” already exists. Pick a different name or edit the existing one.` });
    }
    existing.streams = [...linkedTo, targetStream];
    await existing.save();
    const obj = typeof existing.toObject === "function" ? existing.toObject() : { ...existing };
    return res.status(200).json({ ...obj, linked: true });
  }

  const subject = await Subject.create({ ...sanitizeBody(req.body, { allow: ALLOW.SUBJECT }), slug: await uniqueSlug(Subject, name) });
  res.status(201).json(subject);
}

export async function updateSubject(req, res) {
  const data = stripEchoedImage(sanitizeBody(req.body, { allow: ALLOW.SUBJECT }));
  if (data.name) {
    const taken = await nameTaken(Subject, data.name, "subject", req.params.id);
    if (taken) return res.status(taken.status).json({ message: taken.message });
    data.slug = await uniqueSlug(Subject, data.name, req.params.id);
  }
  const subject = await Subject.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!subject) return res.status(404).json({ message: "Subject not found" });
  res.json(subject);
}

// Soft delete (Recycle Bin): flag the subject; its tree is kept and restored
// with it. Permanent removal happens from the Recycle Bin.
export async function deleteSubject(req, res) {
  const subject = await Subject.findByIdAndUpdate(req.params.id, softDeletePatch(), { new: true });
  if (!subject) return res.status(404).json({ message: "Subject not found" });
  res.json({ message: "Subject moved to Recycle Bin", softDeleted: true });
}

// POST /api/subjects/:id/link — MANUALLY reuse an existing subject in another
// stream: add the given stream to its `streams[]` (no duplicate, content stays
// shared). No-op if it's already the home stream or already linked here.
export async function linkSubjectToStream(req, res) {
  const streamId = req.body?.stream ? String(req.body.stream) : "";
  if (!streamId) return res.status(400).json({ message: "A stream is required to link." });
  const subject = await Subject.findById(req.params.id);
  if (!subject) return res.status(404).json({ message: "Subject not found" });
  const home = String(subject.stream || "");
  const linkedTo = (subject.streams || []).map((s) => String(s));
  if (home !== streamId && !linkedTo.includes(streamId)) {
    subject.streams = [...linkedTo, streamId];
    await subject.save();
  }
  const obj = typeof subject.toObject === "function" ? subject.toObject() : { ...subject };
  res.json({ ...obj, linked: true });
}

// POST /api/subjects/:id/unlink — remove this subject from a LINKED (secondary)
// stream WITHOUT deleting it: its home stream and shared topics/quizzes/questions
// stay intact. Refuses to unlink the HOME stream (delete it from there instead).
export async function unlinkSubjectFromStream(req, res) {
  const streamId = req.body?.stream ? String(req.body.stream) : "";
  if (!streamId) return res.status(400).json({ message: "A stream is required to unlink." });
  const subject = await Subject.findById(req.params.id);
  if (!subject) return res.status(404).json({ message: "Subject not found" });
  if (String(subject.stream || "") === streamId) {
    return res.status(400).json({ message: "This is the subject's home stream — delete it from here instead of unlinking." });
  }
  subject.streams = (subject.streams || []).map((s) => String(s)).filter((s) => s !== streamId);
  await subject.save();
  res.json({ message: "Subject removed from this stream", unlinked: true });
}

/* ---------------- Topics ---------------- */

// GET /api/subjects/:subjectId/topics — includes session count per topic
export async function listTopics(req, res) {
  const topics = await Topic.find({ subject: req.params.subjectId, ...NOT_DELETED, ...visFilter(req) }).sort("index createdAt").lean();
  const topicIds = topics.map((t) => t._id);
  // The admin UI hides the "Session" level (Topic → Quiz directly), so a topic
  // card shows its QUIZ count. Quizzes live under the topic's session(s), so we
  // roll up quiz counts per session back onto the owning topic.
  const sessions = await Session.find({ topic: { $in: topicIds }, ...NOT_DELETED }).select("_id topic").lean();
  const sessionToTopic = new Map(sessions.map((s) => [String(s._id), String(s.topic)]));
  const sessionIds = sessions.map((s) => s._id);
  // Quizzes + questions both live under the topic's session(s) (Question stores
  // its session), so roll each up per session onto the owning topic.
  const [qAgg, questionAgg] = sessions.length
    ? await Promise.all([
        Quiz.aggregate([{ $match: { session: { $in: sessionIds }, deleted: { $ne: true } } }, { $group: { _id: "$session", count: { $sum: 1 } } }]),
        Question.aggregate([{ $match: { session: { $in: sessionIds }, deleted: { $ne: true } } }, { $group: { _id: "$session", count: { $sum: 1 } } }]),
      ])
    : [[], []];
  const perTopicQuizzes = {};
  for (const row of qAgg) {
    const t = sessionToTopic.get(String(row._id));
    if (t) perTopicQuizzes[t] = (perTopicQuizzes[t] || 0) + (row.count || 0);
  }
  const perTopicQuestions = {};
  for (const row of questionAgg) {
    const t = sessionToTopic.get(String(row._id));
    if (t) perTopicQuestions[t] = (perTopicQuestions[t] || 0) + (row.count || 0);
  }
  res.json(topics.map((t) => ({ ...t, quizzes: perTopicQuizzes[String(t._id)] || 0, questions: perTopicQuestions[String(t._id)] || 0 })));
}

// POST /api/topics/:topicId/session — return the topic's single implicit
// session, creating it if missing. The admin Content UI hides the Session level
// (Topic → Quiz), so every quiz under a topic lives in this one auto session;
// students / search / analytics / backup still work because the session exists.
export async function topicSession(req, res) {
  const topic = await Topic.findById(req.params.topicId);
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  let session = await Session.findOne({ topic: topic._id, ...NOT_DELETED }).sort("index createdAt");
  if (!session) session = await Session.create({ subject: topic.subject, topic: topic._id, title: "Quizzes", index: 0 });
  res.json(session);
}

export async function createTopic(req, res) {
  const subjectId = req.body.subject;
  const title = String(req.body.title || "").trim();
  // Skip creating a duplicate topic (same normalised title) under this subject,
  // so re-running "suggest topics" / bulk-add can never pile up duplicates.
  // (Topics have no DB-level uniqueness, so this app-level guard is the control.)
  if (subjectId && title) {
    const siblings = await Topic.find({ subject: subjectId, ...NOT_DELETED }).select("title").lean();
    const key = normName(title);
    if (siblings.some((t) => normName(t.title) === key)) {
      return res.status(409).json({ message: `A topic named "${title}" already exists in this subject.` });
    }
  }
  // Append at the end: index = current number of topics in this subject.
  const index = req.body.index ?? (await Topic.countDocuments({ subject: req.body.subject }));
  const topic = await Topic.create({ ...sanitizeBody(req.body, { allow: ALLOW.TOPIC }), index });
  res.status(201).json(topic);
}

export async function updateTopic(req, res) {
  const topic = await Topic.findByIdAndUpdate(req.params.id, sanitizeBody(req.body, { allow: ALLOW.TOPIC }), { new: true });
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  res.json(topic);
}

// Soft delete (Recycle Bin): flag the topic; its sessions/quizzes/questions are
// kept and restored with it. Permanent removal happens from the Recycle Bin.
export async function deleteTopic(req, res) {
  const topic = await Topic.findByIdAndUpdate(req.params.id, softDeletePatch(), { new: true });
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  res.json({ message: "Topic moved to Recycle Bin", softDeleted: true });
}

/* ---------------- Sessions ---------------- */

// GET /api/topics/:topicId/sessions — includes quiz count per session
export async function listSessions(req, res) {
  const sessions = await Session.find({ topic: req.params.topicId, ...NOT_DELETED }).sort("index createdAt").lean();
  const qMap = await countMap(Quiz, sessions.map((s) => s._id), "session");
  res.json(sessions.map((s) => ({ ...s, quizzes: qMap[String(s._id)] || 0 })));
}

export async function createSession(req, res) {
  const index = req.body.index ?? (await Session.countDocuments({ topic: req.body.topic }));
  const session = await Session.create({ ...sanitizeBody(req.body, { allow: ALLOW.SESSION }), index });
  res.status(201).json(session);
}

export async function updateSession(req, res) {
  const session = await Session.findByIdAndUpdate(req.params.id, sanitizeBody(req.body, { allow: ALLOW.SESSION }), { new: true });
  res.json(session);
}

// Soft delete (Recycle Bin): flag the session; its quizzes/questions are kept
// and restored with it. Permanent removal happens from the Recycle Bin.
export async function deleteSession(req, res) {
  const session = await Session.findByIdAndUpdate(req.params.id, softDeletePatch(), { new: true });
  if (!session) return res.status(404).json({ message: "Session not found" });
  res.json({ message: "Session moved to Recycle Bin", softDeleted: true });
}

/* ---------------- Quizzes (within a session) ---------------- */

// GET /api/sessions/:sessionId/quizzes — includes question count per quiz.
// Ordered by title in NATURAL order (Quiz 1, Quiz 2, … Quiz 9, Quiz 10) instead
// of creation order, so numbered quizzes read in the expected sequence.
export async function listQuizzes(req, res) {
  const quizzes = (await Quiz.find({ session: req.params.sessionId, ...NOT_DELETED, ...visFilter(req) }).lean()).sort(byNatural("title"));
  const qMap = await countMap(Question, quizzes.map((q) => q._id), "quiz");
  res.json(quizzes.map((q) => ({ ...q, questions: qMap[String(q._id)] || 0 })));
}

export async function createQuiz(req, res) {
  // Append at the end so Quiz 1 stays before Quiz 2, etc.
  const index = req.body.index ?? (await Quiz.countDocuments({ session: req.body.session }));
  const quiz = await Quiz.create({ ...sanitizeBody(req.body, { allow: ALLOW.QUIZ }), index });
  notifyNewContent("quiz", quiz); // fire-and-forget (respects admin toggle)
  res.status(201).json(quiz);
}

export async function updateQuiz(req, res) {
  const quiz = await Quiz.findByIdAndUpdate(req.params.id, sanitizeBody(req.body, { allow: ALLOW.QUIZ }), { new: true });
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  res.json(quiz);
}

// Soft delete (Recycle Bin): flag the quiz; its questions are kept and restored
// with it. Permanent removal happens from the Recycle Bin.
export async function deleteQuiz(req, res) {
  const quiz = await Quiz.findByIdAndUpdate(req.params.id, softDeletePatch(), { new: true });
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  res.json({ message: "Quiz moved to Recycle Bin", softDeleted: true });
}

// PATCH /api/quizzes/:id/move  { session } — move a quiz to another session
// (internal migration). Its questions follow to the new session/subject.
export async function moveQuiz(req, res) {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  const session = await Session.findById(req.body.session);
  if (!session) return res.status(400).json({ message: "Choose a target session." });

  if (req.body.copy) {
    const index = await Quiz.countDocuments({ session: session._id });
    const newQuiz = await Quiz.create({ title: `${quiz.title} (copy)`, subject: session.subject, session: session._id, index });
    await duplicateQuestions({ quiz: quiz._id }, { quiz: newQuiz._id, subject: session.subject, session: session._id });
    return res.json({ message: "Copied", _id: newQuiz._id });
  }

  quiz.session = session._id;
  quiz.subject = session.subject;
  await quiz.save();
  // Association-only move — don't bump the questions' updatedAt (their content isn't changing), so the "Updated" stamp keeps meaning "content was edited".
  await Question.updateMany({ quiz: quiz._id }, { $set: { session: session._id, subject: session.subject } }, { timestamps: false });
  res.json({ message: "Migrated", _id: quiz._id });
}

// POST /api/quizzes/:id/split  { perQuiz }
// Split ONE quiz's questions into multiple quizzes of `perQuiz` each. The
// original quiz keeps the first chunk (renamed "Quiz 1"); the rest go into new
// quizzes "Quiz 2", "Quiz 3", … under the same session. e.g. 300 questions at
// 50/quiz → Quiz 1..Quiz 6.
export async function splitQuiz(req, res) {
  const per = Math.max(1, Math.min(500, parseInt(req.body?.perQuiz, 10) || 50));
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });

  const questions = await Question.find({ quiz: quiz._id }).sort("createdAt _id").select("_id").lean();
  const total = questions.length;
  if (total <= per) {
    return res.json({ message: `No split needed — this quiz has ${total} question(s) (≤ ${per}).`, quizzes: 1, created: 0 });
  }

  // Chunk the question ids into groups of `per`.
  const chunks = [];
  for (let i = 0; i < total; i += per) chunks.push(questions.slice(i, i + per).map((q) => q._id));

  // Keep the original quiz's OWN title and its first chunk (no move needed).
  // Name the NEW chunks "Quiz N" continuing AFTER the highest existing quiz
  // number in this session, so splitting e.g. "Quiz 2" (with a "Quiz 1" already
  // present) yields Quiz 3, Quiz 4, … instead of restarting at "Quiz 1" and
  // clobbering the existing one.
  const siblings = await Quiz.find({ session: quiz.session }).select("title").lean();
  const usedNums = new Set();
  let maxNum = 0;
  for (const s of siblings) {
    const m = String(s.title || "").match(/\bQuiz\s+(\d+)\b/i);
    if (m) { const n = parseInt(m[1], 10); usedNums.add(n); if (n > maxNum) maxNum = n; }
  }
  let nextNum = maxNum + 1;
  const nextQuizTitle = () => { while (usedNums.has(nextNum)) nextNum++; usedNums.add(nextNum); return `Quiz ${nextNum++}`; };

  // New quizzes for the remaining chunks, appended after existing quizzes.
  let index = await Quiz.countDocuments({ session: quiz.session });
  for (let k = 1; k < chunks.length; k++) {
    const newQuiz = await Quiz.create({ title: nextQuizTitle(), subject: quiz.subject, session: quiz.session, index: index++ });
    await Question.updateMany({ _id: { $in: chunks[k] } }, { $set: { quiz: newQuiz._id, session: quiz.session, subject: quiz.subject } }, { timestamps: false }); // split = association only, keep updatedAt
  }
  res.json({ message: `Split ${total} questions into ${chunks.length} quizzes.`, quizzes: chunks.length, created: chunks.length - 1 });
}

// POST /api/quizzes/:id/merge  { sourceIds: [] }
// Merge other quizzes' questions INTO this quiz (the inverse of split). Every
// question from each source quiz is moved into the target quiz; the emptied
// source quizzes are then deleted. Sources must be in the SAME session.
export async function mergeQuiz(req, res) {
  const target = await Quiz.findById(req.params.id);
  if (!target) return res.status(404).json({ message: "Quiz not found" });
  const ids = (Array.isArray(req.body?.sourceIds) ? req.body.sourceIds : [])
    .map(String)
    .filter((s) => s && s !== String(target._id));
  if (!ids.length) return res.status(400).json({ message: "Pick at least one other quiz to merge in." });

  const sources = await Quiz.find({ _id: { $in: ids }, session: target.session });
  if (!sources.length) return res.status(404).json({ message: "No matching quizzes to merge (they must be in the same session)." });

  let moved = 0;
  for (const src of sources) {
    const r = await Question.updateMany(
      { quiz: src._id },
      { $set: { quiz: target._id, session: target.session, subject: target.subject } },
      { timestamps: false } // merge = association only, don't bump questions' updatedAt
    );
    moved += r.modifiedCount || 0;
    await Quiz.deleteOne({ _id: src._id });
  }
  const total = await Question.countDocuments({ quiz: target._id });
  res.json({
    message: `Merged ${sources.length} quiz(zes) (${moved} questions) into "${target.title}". It now has ${total} question(s).`,
    merged: sources.length,
    moved,
    total,
  });
}

// POST /api/quizzes/:id/move-questions  { questionIds, targetQuiz }
// MOVE the selected questions from this quiz into ANOTHER quiz (any
// session/subject). A true move: each question's quiz/session/subject refs are
// repointed to the target, so it leaves this quiz and appears in the target.
// Association-only (timestamps:false) so the "Updated" stamp keeps its meaning.
export async function moveQuestions(req, res) {
  const source = await Quiz.findById(req.params.id);
  if (!source) return res.status(404).json({ message: "Source quiz not found" });
  const targetId = String(req.body?.targetQuiz || "");
  if (!targetId || targetId === String(source._id)) return res.status(400).json({ message: "Pick a different destination quiz." });
  const target = await Quiz.findById(targetId);
  if (!target) return res.status(404).json({ message: "Destination quiz not found." });

  // Defense-in-depth: never move questions between institutes (tenants). The
  // tenantId plugin already scopes every read/write per-tenant when enforcement
  // is on, but this explicit same-tenant check keeps the flow safe even if that
  // global switch is ever off — moving is only ever within one institute.
  if (String(source.tenantId || "") !== String(target.tenantId || "")) {
    return res.status(403).json({ message: "You can't move questions between different institutes." });
  }

  // Only questions that ACTUALLY live in this quiz (and aren't in the bin), and
  // that belong to the caller's own space (ownerFilter) — matching
  // updateQuestion/deleteQuestion so move can't touch content it can't edit.
  const wanted = (Array.isArray(req.body?.questionIds) ? req.body.questionIds : []).map(String);
  if (!wanted.length) return res.status(400).json({ message: "Select at least one question to move." });
  const owned = await Question.find({ _id: { $in: wanted }, quiz: source._id, ...ownerFilter(req), ...NOT_DELETED }).select("_id").lean();
  const ids = owned.map((q) => q._id);
  if (!ids.length) return res.status(400).json({ message: "None of the selected questions belong to this quiz." });

  const r = await Question.updateMany(
    { _id: { $in: ids }, ...ownerFilter(req) },
    { $set: { quiz: target._id, session: target.session, subject: target.subject } },
    { timestamps: false }
  );
  const sourceTotal = await Question.countDocuments({ quiz: source._id, ...NOT_DELETED });
  const targetTotal = await Question.countDocuments({ quiz: target._id, ...NOT_DELETED });
  res.json({
    message: `Moved ${r.modifiedCount || ids.length} question(s) to "${target.title}". This quiz now has ${sourceTotal}; "${target.title}" has ${targetTotal}.`,
    moved: r.modifiedCount || ids.length,
    sourceTotal,
    targetTotal,
  });
}

// POST /api/quizzes/:id/copy-questions  { questionIds, targetQuiz }
// Like moveQuestions, but DUPLICATES the selected questions into the target quiz
// (fresh Question docs via the shared duplicateQuestions util — the same path
// moveQuiz's copy uses) and LEAVES the originals in place.
export async function copyQuestions(req, res) {
  const source = await Quiz.findById(req.params.id);
  if (!source) return res.status(404).json({ message: "Source quiz not found" });
  const targetId = String(req.body?.targetQuiz || "");
  if (!targetId) return res.status(400).json({ message: "Pick a destination quiz." });
  const target = await Quiz.findById(targetId);
  if (!target) return res.status(404).json({ message: "Destination quiz not found." });

  // Defense-in-depth: never copy questions between institutes (tenants) — safe
  // even if the tenantId enforcement switch is ever off. See moveQuestions.
  if (String(source.tenantId || "") !== String(target.tenantId || "")) {
    return res.status(403).json({ message: "You can't copy questions between different institutes." });
  }

  const wanted = (Array.isArray(req.body?.questionIds) ? req.body.questionIds : []).map(String);
  if (!wanted.length) return res.status(400).json({ message: "Select at least one question to copy." });
  const owned = await Question.find({ _id: { $in: wanted }, quiz: source._id, ...ownerFilter(req), ...NOT_DELETED }).select("_id").lean();
  const ids = owned.map((q) => q._id);
  if (!ids.length) return res.status(400).json({ message: "None of the selected questions belong to this quiz." });

  const created = await duplicateQuestions(
    { _id: { $in: ids }, ...ownerFilter(req) },
    { quiz: target._id, session: target.session, subject: target.subject }
  );
  const sourceTotal = await Question.countDocuments({ quiz: source._id, ...NOT_DELETED });
  const targetTotal = await Question.countDocuments({ quiz: target._id, ...NOT_DELETED });
  res.json({
    message: `Copied ${created.length} question(s) to "${target.title}". This quiz still has ${sourceTotal}; "${target.title}" now has ${targetTotal}.`,
    copied: created.length,
    sourceTotal,
    targetTotal,
  });
}

// POST /api/topics/:id/split  { perQuiz }
// Split ALL questions in a topic (across its sessions/quizzes) into quizzes of
// `perQuiz` each, named "Quiz 1".."Quiz N", under a single session in the topic.
// Now-empty quizzes and sessions are cleaned up. e.g. 200 questions at 50/quiz
// → Quiz 1..Quiz 4.
export async function splitTopic(req, res) {
  const per = Math.max(1, Math.min(500, parseInt(req.body?.perQuiz, 10) || 50));
  const topic = await Topic.findById(req.params.id);
  if (!topic) return res.status(404).json({ message: "Topic not found" });

  const sessions = await Session.find({ topic: topic._id }).sort("index createdAt");
  const sessionIds = sessions.map((s) => s._id);
  if (!sessionIds.length) return res.json({ message: "This topic has no sessions/questions yet.", quizzes: 0, created: 0 });

  const questions = await Question.find({ session: { $in: sessionIds } }).sort("createdAt _id").select("_id").lean();
  const total = questions.length;
  if (!total) return res.json({ message: "This topic has no questions yet.", quizzes: 0, created: 0 });

  // Target session: reuse the first session (keeps the topic tidy), rest are removed.
  const targetSession = sessions[0];

  const chunks = [];
  for (let i = 0; i < total; i += per) chunks.push(questions.slice(i, i + per).map((q) => q._id));

  // Remove the topic's existing quizzes (questions are reassigned below, not deleted).
  await Quiz.deleteMany({ session: { $in: sessionIds } });

  // Create Quiz 1..N under the target session and move each chunk's questions in.
  for (let k = 0; k < chunks.length; k++) {
    const newQuiz = await Quiz.create({ title: `Quiz ${k + 1}`, subject: targetSession.subject, session: targetSession._id, index: k });
    await Question.updateMany(
      { _id: { $in: chunks[k] } },
      { $set: { quiz: newQuiz._id, session: targetSession._id, subject: targetSession.subject } },
      { timestamps: false } // split = association only, don't bump questions' updatedAt
    );
  }

  // Drop the now-empty extra sessions (all questions live under targetSession now).
  const extraSessionIds = sessionIds.filter((id) => String(id) !== String(targetSession._id));
  if (extraSessionIds.length) await Session.deleteMany({ _id: { $in: extraSessionIds } });

  res.json({ message: `Split ${total} questions into ${chunks.length} quizzes.`, quizzes: chunks.length, created: chunks.length });
}

// GET /api/quizzes/:quizId/questions — practice questions (with answers)
export async function listQuizQuestions(req, res) {
  // Block students whose quiz access was disabled by an admin.
  if (req.user && req.user.role !== "admin" && req.user.quizAccess === false) {
    return res.status(403).json({ message: "Quiz access has been disabled for your account." });
  }
  const isAdmin = req.user?.role === "admin";
  const questions = await Question.find({
    quiz: req.params.quizId,
    ...NOT_DELETED,
    ...(isAdmin ? {} : { status: "published" }),
  });
  res.json(questions);
}

/* ---------------- Questions ---------------- */

// GET /api/sessions/:sessionId/questions
// Quizzes are practice with instant feedback, so the correct answer and
// explanation are returned. (Graded tests hide the answer — see testController.)
export async function listQuestions(req, res) {
  const isAdmin = req.user?.role === "admin";
  const questions = await Question.find({
    session: req.params.sessionId,
    ...NOT_DELETED,
    ...(isAdmin ? {} : { status: "published" }),
  });
  res.json(questions);
}

// GET /api/questions  (admin) — list all questions with their full location
// (stream → subject → topic → session → quiz) so the UI can show a breadcrumb.
export async function listAllQuestions(req, res) {
  const questions = await Question.find({ ...NOT_DELETED })
    .sort("-createdAt")
    .limit(2000)
    .populate({ path: "subject", select: "name stream", populate: { path: "stream", select: "name" } })
    .populate({ path: "session", select: "title topic", populate: { path: "topic", select: "title" } })
    .populate("quiz", "title")
    .lean();
  res.json(
    questions.map((q) => ({
      ...q,
      stream: q.subject?.stream?.name || "",
      subject: q.subject?.name || "—",
      // Hierarchical topic (from the session) with a fallback to the free-text topic.
      topicName: q.session?.topic?.title || q.topic || "",
      session: q.session?.title || "—",
      quiz: q.quiz?.title || "—",
    }))
  );
}

export async function createQuestion(req, res) {
  const question = await Question.create(req.body);
  res.status(201).json(question);
}

// POST /api/questions/bulk
// Body: { questions: [...], context: { subject, session, quiz, testSeries, status } }
// The context is merged into every question so the client only sends the
// per-question fields (text, options, correct, …). Test-series questions are
// also linked into that test's question list.
export async function bulkCreateQuestions(req, res) {
  const { questions, context = {} } = req.body;
  if (!Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ message: "questions array is required" });
  }
  // A client may only bulk-add into their OWN test/practice item.
  if (context.testSeries) {
    const ts = await TestSeries.findById(context.testSeries).select("owner");
    if (!ts) return res.status(404).json({ message: "Target item not found" });
    if (isClient(req) && String(ts.owner || "") !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your content" });
    }
  }
  const owner = ownerValue(req);

  // Validate each question UP FRONT so we can (a) insert every good one and
  // (b) tell the client EXACTLY which questions were rejected and why. Before,
  // insertMany(ordered:false) silently dropped any doc that failed the schema
  // (e.g. not exactly 4 options), so an upload of 199 could quietly become 179
  // with no explanation. Now nothing is lost silently — each failure is
  // reported with its 1-based number, type, a snippet of its text, and the
  // exact validation reason.
  const good = [];
  const errors = [];
  questions.forEach((q, i) => {
    const doc = new Question({ status: "published", ...q, ...context, owner });
    const ve = doc.validateSync();
    if (ve) {
      const reason =
        Object.values(ve.errors || {})
          .map((e) => e.message)
          .join("; ") || "Invalid question";
      errors.push({ number: i + 1, type: q.type || "mcq", text: String(q.text || "").slice(0, 80), reason });
    } else {
      good.push(doc);
    }
  });

  // ordered:false still guards against any residual write error on the good set.
  let created = [];
  if (good.length) {
    try {
      created = await Question.insertMany(good, { ordered: false });
    } catch (err) {
      created = Array.isArray(err?.insertedDocs) ? err.insertedDocs : [];
    }
  }

  // Attach to the test series' question list when uploading test questions.
  if (context.testSeries && created.length) {
    await TestSeries.findByIdAndUpdate(context.testSeries, {
      $push: { questions: { $each: created.map((c) => c._id) } },
    });
  }
  res.status(201).json({
    inserted: created.length,
    requested: questions.length,
    skipped: errors.length,
    errors: errors.slice(0, 50), // cap the payload; enough to diagnose the batch
  });
}

export async function updateQuestion(req, res) {
  const patch = sanitizeBody(req.body); // strips owner/tenantId/_id/etc.
  const question = await Question.findOneAndUpdate({ _id: req.params.id, ...ownerFilter(req) }, patch, { new: true });
  if (!question) return res.status(404).json({ message: "Question not found" });
  res.json(question);
}

// Normalize a text fragment for comparison: lowercase, strip LaTeX markers and
// punctuation, collapse whitespace. So "What is 2+2?" and "what is  2 + 2" match.
function normalizeText(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/\$/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const normArr = (a) => (Array.isArray(a) ? a : []).map(normalizeText).join("|");
const normTable = (rows) =>
  Array.isArray(rows)
    ? rows.map((r) => (Array.isArray(r) ? r.map(normalizeText).join("~") : normalizeText(r))).join("||")
    : "";

// A question is a duplicate only if EVERY content detail matches — not just the
// stem text. This includes the type-specific fields so, e.g., two Assertion &
// Reason questions (which share the same stem + standard options) are only
// duplicates when their Assertion AND Reason texts are also identical.
function questionSignature(q) {
  return [
    q.type || "mcq",
    normalizeText(q.text),
    normArr(q.options), // all options
    normArr(q.columnA), // matching / pair / pairselect
    normArr(q.columnB),
    normalizeText(q.assertion), // assertion & reason
    normalizeText(q.reason),
    normTable(q.tableRows), // table-based
    normalizeText(q.image), // image/diagram
  ].join("##");
}

// GET /api/questions/duplicates  (admin)
// Finds full-question duplicates, but ONLY within the same container so copies
// never cross categories:
//   • Quiz content  → grouped per SUBJECT (a subject's quizzes only)
//   • Test Series   → grouped per test series
//   • Practice Quiz / Practice Test → grouped per practice item
// Returns groups (count > 1) with the full question (options + correct) so the
// admin can view and confirm before deleting.
export async function findDuplicates(req, res) {
  // Optional filters restrict the scan to one container:
  //   ?subject=<id>          → one quiz subject (e.g. Economics)
  //   ?practiceSubject=<id>  → all practice items under one practice subject
  //   ?testSeries=<id>       → a single test-series / practice item
  const filter = { ...ownerFilter(req), ...NOT_DELETED }; // clients scan only their own (non-binned) bank
  if (req.query.subject && req.query.subject !== "all") filter.subject = req.query.subject;
  if (req.query.testSeries) filter.testSeries = req.query.testSeries;
  if (req.query.practiceSubject) {
    const items = await TestSeries.find({ practiceSubject: req.query.practiceSubject }).select("_id").lean();
    filter.testSeries = { $in: items.map((i) => i._id) };
  }
  // ?pool=1 (with practiceSubject): pool the comparison ACROSS all of the
  // subject's items/topics, so the same question appearing in two different
  // topic quizzes is flagged — instead of the default per-item grouping.
  const poolScopeId = (req.query.practiceSubject && (req.query.pool === "1" || req.query.pool === "true"))
    ? `psub:${req.query.practiceSubject}`
    : null;

  const questions = await Question.find(filter)
    .select("text options correct type difficulty status subject quiz session testSeries createdAt assertion reason columnA columnB tableRows image")
    .populate("subject", "name")
    .populate("quiz", "title")
    .populate("testSeries", "name practice practiceKind")
    .lean();

  // Determine which container a question belongs to (its dedup scope).
  const meta = (q) => {
    if (q.testSeries) {
      const ts = q.testSeries;
      const category = ts.practice
        ? ts.practiceKind === "quiz"
          ? "Practice Quiz"
          : "Practice Test"
        : "Public Test Series";
      return {
        category,
        scopeId: poolScopeId || String(ts._id),
        scopeName: poolScopeId ? "Across all topics" : (ts.name || "Untitled"),
        location: ts.name || "Untitled",
      };
    }
    if (q.subject || q.quiz) {
      return {
        category: "Quiz",
        scopeId: String(q.subject?._id || "no-subject"),
        scopeName: q.subject?.name || "Quiz",
        location: [q.subject?.name, q.quiz?.title].filter(Boolean).join(" › ") || "Quiz",
      };
    }
    return { category: "Uncategorized", scopeId: "none", scopeName: "—", location: "—" };
  };

  const groups = new Map();
  for (const q of questions) {
    if (!normalizeText(q.text)) continue;
    const m = meta(q);
    // Group only within the SAME category + container + identical full question.
    const key = `${m.category}::${m.scopeId}::${questionSignature(q)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        category: m.category,
        scopeName: m.scopeName,
        text: q.text,
        options: q.options || [],
        correct: q.correct,
        type: q.type,
        difficulty: q.difficulty,
        // full content for the "View question" confirmation panel
        assertion: q.assertion,
        reason: q.reason,
        columnA: q.columnA,
        columnB: q.columnB,
        tableRows: q.tableRows,
        image: q.image,
        questions: [],
      });
    }
    groups.get(key).questions.push({
      _id: q._id,
      status: q.status,
      location: m.location,
      createdAt: q.createdAt,
    });
  }

  const dupes = [...groups.values()]
    .filter((g) => g.questions.length > 1)
    .map((g) => ({ ...g, count: g.questions.length }))
    .sort((a, b) => b.count - a.count);

  const extras = dupes.reduce((s, g) => s + (g.count - 1), 0);
  res.json({ scanned: questions.length, groups: dupes.length, extras, duplicates: dupes });
}

// Soft delete (Recycle Bin): flag the question so it disappears from lists but
// can be restored. If it belonged to a test, remove it from that test's
// question list (it's re-added on restore) so it doesn't count while binned.
export async function deleteQuestion(req, res) {
  const q = await Question.findOne({ _id: req.params.id, ...ownerFilter(req), ...NOT_DELETED });
  if (!q) return res.status(404).json({ message: "Question not found" });
  if (q.testSeries) await TestSeries.findByIdAndUpdate(q.testSeries, { $pull: { questions: q._id } });
  await Question.findByIdAndUpdate(q._id, softDeletePatch());
  res.json({ message: "Question moved to Recycle Bin", softDeleted: true });
}


/* ------------------------- Question Checker -------------------------------
   "Did this question come from my bank?" — given pasted text (bulk or single
   questions) or an explicit list of stems, report for EACH input question
   whether the caller's OWN bank already contains it: an exact copy, a very
   similar (near-duplicate) question, or a related one (same topic/terms, e.g.
   the same question reworded with different options). Owner-scoped, so a client
   only searches their own content and an admin only platform content. Pure DB +
   lexical matching (Mongo full-text index + token overlap) — no AI/quota. */

// Meaningful words in a stem (lowercased, length >= 4, minus filler words) used
// to measure topical overlap between two questions independent of their options.
const CHECK_STOPWORDS = new Set(
  ("the a an of to in on at for and or but is are was were be been being do does did which what who whom whose when where why how " +
   "that this these those with without into from by as it its their his her they them following consider statement statements " +
   "correct incorrect true false not all none only both about above given below choose select mark identify option options " +
   "question answer regarding respectively context term following which specific").split(/\s+/)
);
const checkTokens = (t) =>
  new Set(
    String(t || "")
      .toLowerCase()
      .replace(/\$[^$]*\$/g, " ") // ignore LaTeX so wording, not symbols, is compared
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !CHECK_STOPWORDS.has(w))
  );
const checkJaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
};
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Human-readable location of a matched bank question (Stream › Subject › Topic ›
// Quiz, or the Test/Practice item name).
export function questionLocation(q) {
  if (q.testSeries) {
    const ts = q.testSeries;
    const cat = ts.practice ? (ts.practiceKind === "quiz" ? "Practice Quiz" : "Practice Test") : "Public Test Series";
    return `${cat}: ${ts.name || "Untitled"}`;
  }
  const parts = [q.subject?.stream?.name, q.subject?.name, q.session?.topic?.title || q.topic, q.quiz?.title].filter(Boolean);
  return parts.length ? parts.join(" › ") : "Quiz";
}

// Strip a leading question number ("1.", "Q2)", "12 -") and keep only the STEM
// of a pasted block — drop trailing option lines ("A) …", "(b) …", "1. …") and
// answer/explanation lines so we compare the question, not its options.
function stemOfBlock(block) {
  const lines = String(block || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const stemLines = [];
  for (const l of lines) {
    if (/^\(?\s*[a-dA-D1-4]\s*[).\]]\s+\S/.test(l)) break;                 // option line: "A) …" / "(b) …" / "1. …"
    if (/^(ans(wer)?|correct(\s+answer)?|explanation|sol(ution)?|reason)\b/i.test(l)) break; // answer/explanation
    stemLines.push(l);
  }
  let stem = (stemLines.join(" ") || lines.join(" ")).trim();
  stem = stem.replace(/^\s*(?:Q(?:uestion)?\s*)?\.?\s*\d{1,3}\s*[.)\-:]\s*/i, "").trim(); // leading number
  return stem;
}

// FULL content of a pasted block for comparison — every line EXCEPT the trailing
// answer-key / explanation lines. Unlike stemOfBlock this KEEPS the options,
// the matching/pair columns, the statement list AND the Reason line, so
// structured questions (matching, pair, statement, assertion & reason) are
// compared on their real content, not just their short/generic stem.
export function contentOfBlock(block) {
  return String(block || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(ans(wer)?|correct(\s+answer)?|explanation|sol(ution)?)\b/i.test(l))
    .join(" ");
}

// Split pasted text into individual question stems. Prefers explicit numbering
// ("1." / "Q2)" / "3 -"); falls back to blank-line separation; else treats the
// whole text as a single question.
export function splitIntoStems(content) {
  const raw = String(content || "").replace(/\r/g, "").trim();
  if (!raw) return [];
  let blocks = raw
    .split(/\n(?=\s*(?:Q(?:uestion)?\s*)?\.?\s*\d{1,3}\s*[.)\-:]\s)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (blocks.length < 2) {
    const byBlank = raw.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
    blocks = byBlank.length >= 2 ? byBlank : [raw];
  }
  return blocks
    .map((block) => ({ stem: stemOfBlock(block).trim(), block: String(block).trim() }))
    .filter((it) => it.stem.length >= 8)
    .slice(0, 200);
}

// POST /api/questions/check  { content? , stems?[] }
// Returns per-question match status against the caller's own bank.
export async function checkQuestions(req, res) {
  const own = { ...ownerFilter(req), ...NOT_DELETED };
  const provided = Array.isArray(req.body?.stems)
    ? req.body.stems.map((s) => String(s || "").trim()).filter((s) => s.length >= 8).map((s) => ({ stem: s, block: s }))
    : null;
  const items = (provided && provided.length ? provided : splitIntoStems(req.body?.content)).slice(0, 200);
  if (!items.length) {
    return res.status(400).json({ message: "Paste at least one question (or upload a file) to check." });
  }

  const summary = { exact: 0, strong: 0, related: 0, none: 0 };
  const scored = [];
  for (const { stem, block } of items) {
    const fullContent = contentOfBlock(block);
    const stemTokens = checkTokens(stem);              // stem only — catches reworded MCQs (options ignored)
    const fullTokens = checkTokens(fullContent);       // stem + columns/pairs/statements/assertion/reason/options
    const normStem = normalizeText(stem);
    // Search the full-text index with the WHOLE content (it indexes text,
    // options, assertion, reason, columnA & columnB), so a matching/pair/
    // assertion question is found by its columns/pairs/reason, not just a
    // generic intro like "Consider the following pairs:".
    const searchText = (fullContent || stem).slice(0, 400);
    let candidates = [];
    try {
      candidates = await Question.find(
        { $text: { $search: searchText }, ...own },
        { score: { $meta: "textScore" }, text: 1, type: 1, options: 1, columnA: 1, columnB: 1, assertion: 1, reason: 1 }
      ).sort({ score: { $meta: "textScore" } }).limit(25).lean();
    } catch {
      candidates = [];
    }
    // Fallback keyword search when the text index returns nothing.
    if (!candidates.length && (fullTokens.size || stemTokens.size)) {
      const words = [...(fullTokens.size ? fullTokens : stemTokens)].slice(0, 10).map(escapeRe);
      if (words.length) {
        candidates = await Question.find({ text: new RegExp(words.join("|"), "i"), ...own })
          .select("text type options columnA columnB assertion reason").limit(25).lean();
      }
    }
    const cand = [];
    for (const c of candidates) {
      // Compare on BOTH the stem alone and the full content; take the stronger
      // signal. So plain MCQs match on the stem (reworded options still count),
      // while matching/pair/statement/assertion questions match on their
      // columns/pairs/statements/assertion/reason content.
      const bankFull = [
        c.text, c.assertion, c.reason,
        ...(Array.isArray(c.columnA) ? c.columnA : []),
        ...(Array.isArray(c.columnB) ? c.columnB : []),
        ...(Array.isArray(c.options) ? c.options : []),
      ].filter(Boolean).join(" ");
      const stemSim = checkJaccard(stemTokens, checkTokens(c.text));
      const fullSim = checkJaccard(fullTokens, checkTokens(bankFull));
      const sim = Math.max(stemSim, fullSim);
      // A true exact copy: identical stem AND its overall content matches too
      // (so two different pair questions that share the generic intro aren't
      // wrongly called "exact").
      const exact = normStem.length > 0 && normalizeText(c.text) === normStem && fullSim >= 0.6;
      // Only surface matches with a meaningful overlap: hide anything below 40%
      // (weak/noise). exact = 100, strong >= 60%, related = 40-60%.
      let st = "none";
      if (exact) st = "exact";
      else if (sim >= 0.6) st = "strong";
      else if (sim >= 0.4) st = "related";
      if (st !== "none") cand.push({ id: String(c._id), status: st, similarity: exact ? 100 : Math.round(sim * 100), sim, exact });
    }
    // Best first (exact, then strongest overlap), keep the top few so the user
    // sees EVERY place this question appears in the bank (incl. matching / pair /
    // assertion versions of the same content), not just one.
    cand.sort((a, b) => (Number(b.exact) - Number(a.exact)) || (b.sim - a.sim));
    const matches = cand.slice(0, 10);
    const status = matches[0]?.status || "none";
    summary[status] += 1;
    scored.push({ question: stem, yourQuestion: block, status, similarity: matches[0]?.similarity || 0, matches });
  }

  // Resolve human-readable locations for the matched questions in one query.
  const ids = [...new Set(scored.flatMap((s) => s.matches.map((m) => m.id)))];
  const locMap = new Map();
  if (ids.length) {
    const docs = await Question.find({ _id: { $in: ids } })
      .select("text type options correct columnA columnB assertion reason tableRows image explanation difficulty subject quiz session testSeries topic")
      .populate({ path: "subject", select: "name stream", populate: { path: "stream", select: "name" } })
      .populate({ path: "session", select: "title topic", populate: { path: "topic", select: "title" } })
      .populate("quiz", "title")
      .populate("testSeries", "name practice practiceKind")
      .lean();
    for (const d of docs) locMap.set(String(d._id), d);
  }

  const buildMatch = (m) => {
    const d = locMap.get(String(m.id));
    if (!d) return null;
    return {
      id: String(d._id),
      text: d.text,
      type: d.type,
      options: d.options || [],
      correct: d.correct,
      columnA: d.columnA || [],
      columnB: d.columnB || [],
      assertion: d.assertion,
      reason: d.reason,
      tableRows: d.tableRows,
      image: d.image,
      explanation: d.explanation,
      difficulty: d.difficulty,
      location: questionLocation(d),
      status: m.status,
      similarity: m.similarity,
    };
  };
  const results = scored.map((s) => {
    const matches = s.matches.map(buildMatch).filter(Boolean);
    return {
      question: s.question,
      yourQuestion: s.yourQuestion,
      status: s.status,
      similarity: s.similarity,
      matches,
      match: matches[0] || null, // first/best match (kept for compatibility)
    };
  });

  const found = summary.exact + summary.strong + summary.related;
  res.json({ total: items.length, found, summary, results });
}
