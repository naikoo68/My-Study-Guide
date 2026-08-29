import Review from "../models/Review.js";
import { sendMail } from "../config/mailer.js";
import { NOT_DELETED, softDeletePatch } from "../utils/softDelete.js";

const clampRating = (r) => {
  const n = Number(r);
  if (!Number.isFinite(n)) return 5;
  return Math.min(5, Math.max(1, Math.round(n)));
};

// POST /api/reviews — submit a review (guest, student or client)
export async function createReview(req, res) {
  const name = String(req.body.name || "").trim() || req.user?.name || "";
  const text = String(req.body.text || "").trim();
  const exam = String(req.body.exam || "").trim().slice(0, 120);

  if (!name) return res.status(400).json({ message: "Please enter your name." });
  if (!text || text.length < 8) return res.status(400).json({ message: "Please write a short review (at least a few words)." });
  if (text.length > 600) return res.status(400).json({ message: "Please keep your review under 600 characters." });

  const role = req.user?.role === "client" ? "client" : req.user ? "student" : "guest";

  // Optional profile photo (hosted URL or a small data-URI kept small by the client).
  let photo = String(req.body.photo || "").trim();
  if (photo && (!/^data:image\/|^https?:\/\//i.test(photo) || photo.length > 3_000_000)) photo = "";

  const review = await Review.create({
    user: req.user?._id,
    name: name.slice(0, 80),
    exam,
    rating: clampRating(req.body.rating),
    text,
    photo,
    email: String(req.body.email || "").trim() || req.user?.email || "",
    role,
    status: "pending",
  });

  // Best-effort admin notification.
  const to = process.env.NOTIFY_EMAIL || process.env.SMTP_FROM;
  if (to) {
    sendMail({
      to,
      subject: "New review submitted — awaiting approval",
      text: [
        `${review.name}${exam ? ` (${exam})` : ""} left a ${review.rating}/5 review:`,
        "",
        text,
        "",
        "Approve it in Admin → Reviews to show it on the home page.",
      ].join("\n"),
      replyTo: review.email || undefined,
    }).catch(() => {});
  }

  res.status(201).json({ ok: true, id: review._id });
}

// GET /api/reviews/approved — PUBLIC: approved reviews for the CURRENT institute
// (tenant-scoped automatically), shown in the home page "What our students say"
// section. Because reviews carry the tenant they were submitted under, each
// institute shows only its own real reviews — never another institute's or any
// seeded demo data.
export async function listApprovedReviews(req, res) {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));
  const items = await Review.find({ status: "approved", ...NOT_DELETED })
    .sort("-updatedAt")
    .limit(limit)
    .select("name exam rating text photo")
    .lean();
  res.json({ items });
}

// GET /api/reviews  (admin) — list submissions
export async function listReviews(req, res) {
  const items = await Review.find(NOT_DELETED).sort("-createdAt").limit(500).lean();
  const pending = await Review.countDocuments({ status: "pending", ...NOT_DELETED });
  res.json({ items, pending });
}

// PATCH /api/reviews/:id/approve  (admin) — approve so it appears on the home
// page. The home page reads approved reviews directly (tenant-scoped), so there
// is no separate copy into settings — approving is all that's needed.
export async function approveReview(req, res) {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: "Not found" });
  if (review.status !== "approved") {
    review.status = "approved";
    await review.save();
  }
  res.json({ id: review._id, status: review.status });
}

// PATCH /api/reviews/:id/reject  (admin)
export async function rejectReview(req, res) {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: "Not found" });
  review.status = "rejected";
  await review.save();
  res.json({ id: review._id, status: review.status });
}

// DELETE /api/reviews/:id  (admin) — soft delete → Recycle Bin
export async function deleteReview(req, res) {
  await Review.findByIdAndUpdate(req.params.id, softDeletePatch());
  res.json({ message: "Review moved to Recycle Bin" });
}
