import Notice from "../models/Notice.js";
import { getFacebookConfig, postToFacebookPage } from "../config/facebook.js";

// GET /api/notices — public: only active notices for the ticker
export async function listActiveNotices(req, res) {
  const notices = await Notice.find({ active: true })
    .sort({ order: 1, createdAt: -1 })
    .limit(50)
    .lean();
  res.json(notices);
}

// GET /api/notices/all — admin: every notice
export async function listNotices(req, res) {
  const notices = await Notice.find().sort({ order: 1, createdAt: -1 }).lean();
  res.json(notices);
}

// POST /api/notices — admin
export async function createNotice(req, res) {
  const { text, link = "", active = true, order = 0 } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ message: "Notice text is required" });
  }
  const notice = await Notice.create({ text: text.trim(), link, active, order });

  // Auto-post the notice to the Facebook Page when enabled. Fire-and-forget so
  // it never blocks or fails the admin's request; errors are logged only.
  (async () => {
    try {
      const cfg = await getFacebookConfig();
      if (cfg.enabled && cfg.autoOnNotice && cfg.pageId && cfg.token) {
        const r = await postToFacebookPage({ message: notice.text, link: notice.link || undefined }, cfg);
        if (!r.ok) console.error("Facebook auto-post failed:", r.error);
      }
    } catch (e) {
      console.error("Facebook auto-post error:", e.message);
    }
  })();

  res.status(201).json(notice);
}

// PUT /api/notices/:id — admin
export async function updateNotice(req, res) {
  const notice = await Notice.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!notice) return res.status(404).json({ message: "Notice not found" });
  res.json(notice);
}

// DELETE /api/notices/:id — admin
export async function deleteNotice(req, res) {
  await Notice.findByIdAndDelete(req.params.id);
  res.json({ message: "Notice deleted" });
}
