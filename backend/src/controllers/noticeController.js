import Notice from "../models/Notice.js";
import { NOT_DELETED, softDeletePatch } from "../utils/softDelete.js";

// GET /api/notices — public: only active, non-expired notices for the ticker.
// A content notice past its expiresAt is hidden from students; manual notices
// (expiresAt = null) are always shown.
export async function listActiveNotices(req, res) {
  const notices = await Notice.find({
    active: true,
    ...NOT_DELETED,
    $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  })
    .sort({ order: 1, createdAt: -1 })
    .limit(50)
    .lean();
  res.json(notices);
}

// GET /api/notices/all — admin: every notice
export async function listNotices(req, res) {
  const notices = await Notice.find(NOT_DELETED).sort({ order: 1, createdAt: -1 }).lean();
  res.json(notices);
}

// POST /api/notices — admin
export async function createNotice(req, res) {
  const { text, link = "", active = true, order = 0 } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ message: "Notice text is required" });
  }
  const notice = await Notice.create({ text: text.trim(), link, active, order });
  res.status(201).json(notice);
}

// PUT /api/notices/:id — admin
export async function updateNotice(req, res) {
  const notice = await Notice.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!notice) return res.status(404).json({ message: "Notice not found" });
  res.json(notice);
}

// DELETE /api/notices/content — admin: clear ALL auto/content notices at once
// (soft delete → Recycle Bin). Manual announcements are left untouched. Lets an
// admin wipe the auto "New … added" pile-up in one tap.
export async function clearContentNotices(req, res) {
  const result = await Notice.updateMany({ auto: true, ...NOT_DELETED }, softDeletePatch());
  const cleared = result.modifiedCount ?? result.nModified ?? 0;
  res.json({ message: `Cleared ${cleared} content notice(s)`, cleared });
}

// DELETE /api/notices/:id — admin (soft delete → Recycle Bin)
export async function deleteNotice(req, res) {
  await Notice.findByIdAndUpdate(req.params.id, softDeletePatch());
  res.json({ message: "Notice moved to Recycle Bin" });
}
