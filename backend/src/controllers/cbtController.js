import crypto from "crypto";
import TestSeries from "../models/TestSeries.js";
import CbtAttempt from "../models/CbtAttempt.js";
import { gradeSubmission } from "./testController.js";
import { sendMail, isMailConfigured } from "../config/mailer.js";

/* ============================ helpers ============================ */

// Only the admin manages CBT exams (they live on platform / ownerless tests).
const isAdmin = (req) => req.user?.role === "admin";

// Whether a CBT link is currently usable (enabled and not past its expiry).
const cbtExpired = (t) => t.cbtExpiresAt && new Date(t.cbtExpiresAt).getTime() < Date.now();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const optLetter = (n) => (n == null ? "—" : String.fromCharCode(65 + Number(n)));
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Base URL of the frontend (hash router), for links emailed to students.
const clientBase = () => (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
const resultUrlFor = (token) => `${clientBase()}/#/cbt/result/${token}`;

// Turn OFF any CBT exam whose expiry has passed so it drops off the admin list
// and can no longer be opened. (getCbtExam also blocks expired links.)
export async function disableExpiredCbtExams() {
  try {
    await TestSeries.updateMany(
      { cbtEnabled: true, cbtExpiresAt: { $ne: null, $lte: new Date() } },
      { $set: { cbtEnabled: false } }
    );
  } catch { /* ignore — next sweep retries */ }
}
setInterval(disableExpiredCbtExams, 10 * 60 * 1000).unref();

// The canonical leaderboard for a CBT exam: the BEST attempt per student
// (deduped by email — highest score, then fastest), ranked. Shared by the
// admin dashboard and by rank computation on submit.
function rankBestPerStudent(attempts) {
  const best = new Map(); // email -> attempt
  for (const a of attempts) {
    const key = (a.email || "").toLowerCase();
    const cur = best.get(key);
    if (!cur || a.score > cur.score || (a.score === cur.score && (a.timeTaken || 0) < (cur.timeTaken || 0))) {
      best.set(key, a);
    }
  }
  const rows = [...best.values()].sort(
    (x, y) => (y.score || 0) - (x.score || 0) || (x.timeTaken || 0) - (y.timeTaken || 0)
  );
  return rows.map((a, i) => ({ ...a, rank: i + 1 }));
}

/* ===================== public (no auth) endpoints ===================== */

// GET /api/cbt/exam/:token — fetch a CBT exam to take. No auth. Correct answers
// and explanations are ALWAYS stripped (it's a proctored-style exam).
export async function getCbtExam(req, res) {
  const test = await TestSeries.findOne({ cbtToken: req.params.token, cbtEnabled: true }).populate("questions");
  if (!test) return res.status(404).json({ message: "This exam link is invalid or the exam is no longer open." });
  if (cbtExpired(test)) return res.status(403).json({ message: "This exam has closed." });

  const obj = test.toObject();
  const questions = (obj.questions || []).map((q) => {
    const { correct, explanation, optionExplanations, ...rest } = q; // hide answers
    return rest;
  });
  res.json({
    _id: obj._id,
    name: obj.name,
    duration: obj.duration,
    marks: obj.marks,
    negativeMarking: obj.negativeMarking,
    questionCount: questions.length,
    questions,
  });
}

// POST /api/cbt/exam/:token/view — count that someone OPENED the exam link.
// No auth. Called once per browser (localStorage-guarded) for a rough unique count.
export async function registerCbtView(req, res) {
  const test = await TestSeries.findOne({ cbtToken: req.params.token, cbtEnabled: true }).select("_id cbtExpiresAt cbtEnabled");
  if (!test) return res.status(404).json({ message: "This exam link is invalid." });
  if (cbtExpired(test)) return res.status(403).json({ message: "This exam has closed." });
  await TestSeries.updateOne({ _id: test._id }, { $inc: { cbtViews: 1 } });
  res.json({ ok: true });
}

// POST /api/cbt/exam/:token/submit — grade a CBT attempt. Body:
// { name, email, answers:{questionId:optionIndex}, timeTaken }. Stores the
// attempt WITH the student's identity, computes their rank, emails the result,
// and returns the graded summary + review + rank + result-page token.
export async function submitCbt(req, res) {
  const { name = "", email = "", answers = {}, timeTaken = 0 } = req.body || {};
  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  if (!cleanName) return res.status(400).json({ message: "Please enter your name." });
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ message: "Please enter a valid email address." });

  const test = await TestSeries.findOne({ cbtToken: req.params.token, cbtEnabled: true }).populate("questions");
  if (!test) return res.status(404).json({ message: "This exam link is invalid or the exam is no longer open." });
  if (cbtExpired(test)) return res.status(403).json({ message: "This exam has closed." });

  const g = gradeSubmission(test, answers);
  const resultToken = crypto.randomBytes(16).toString("hex");

  // Store the attempt with the full graded review snapshot.
  let attempt;
  try {
    attempt = await CbtAttempt.create({
      testSeries: test._id,
      name: cleanName,
      email: cleanEmail,
      total: g.total, attempted: g.attempted, correct: g.correct, incorrect: g.incorrect,
      skipped: g.skipped, score: g.score, maxScore: test.marks, percentage: g.percentage,
      timeTaken: Number(timeTaken) || 0,
      review: g.review,
      resultToken,
    });
  } catch (e) {
    return res.status(500).json({ message: "Could not save your attempt. Please try again." });
  }
  await TestSeries.findByIdAndUpdate(test._id, { $inc: { attempts: 1 } });

  // Compute this student's rank on the live (best-per-student) leaderboard.
  let rank = 1, candidates = 1;
  try {
    const all = await CbtAttempt.find({ testSeries: test._id }).select("email score timeTaken").lean();
    const board = rankBestPerStudent(all);
    candidates = board.length;
    const mine = board.find((r) => (r.email || "").toLowerCase() === cleanEmail);
    rank = mine?.rank || 1;
    await CbtAttempt.updateOne({ _id: attempt._id }, { $set: { rankAtSubmit: rank, candidatesAtSubmit: candidates } });
  } catch { /* rank is best-effort */ }

  // Email the result (fire-and-forget — never block the student's result).
  emailCbtResult({ attempt, test, rank, candidates, resultToken }).catch(() => {});

  res.status(201).json({
    resultToken,
    rank,
    candidates,
    total: g.total,
    attempted: g.attempted,
    skipped: g.skipped,
    correct: g.correct,
    incorrect: g.incorrect,
    score: g.score,
    maxScore: test.marks,
    percentage: g.percentage,
    timeTaken: Number(timeTaken) || 0,
    review: g.review,
    emailQueued: isMailConfigured(),
  });
}

// GET /api/cbt/result/:resultToken — the stored result for the printable public
// result page (no login — reached from the link emailed to the student). Rank
// is recomputed live so it reflects the current standings.
export async function getCbtResult(req, res) {
  const attempt = await CbtAttempt.findOne({ resultToken: req.params.resultToken }).lean();
  if (!attempt) return res.status(404).json({ message: "This result link is invalid or has expired." });
  const test = await TestSeries.findById(attempt.testSeries).select("name marks duration").lean();

  let rank = attempt.rankAtSubmit || null, candidates = attempt.candidatesAtSubmit || null;
  try {
    const all = await CbtAttempt.find({ testSeries: attempt.testSeries }).select("email score timeTaken").lean();
    const board = rankBestPerStudent(all);
    candidates = board.length;
    const mine = board.find((r) => (r.email || "").toLowerCase() === (attempt.email || "").toLowerCase());
    if (mine) rank = mine.rank;
  } catch { /* fall back to stored snapshot */ }

  res.json({
    examName: test?.name || "Exam",
    name: attempt.name,
    email: attempt.email,
    submittedAt: attempt.createdAt,
    rank,
    candidates,
    total: attempt.total,
    attempted: attempt.attempted,
    skipped: attempt.skipped,
    correct: attempt.correct,
    incorrect: attempt.incorrect,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage,
    timeTaken: attempt.timeTaken,
    review: attempt.review || [],
  });
}

/* ========================= admin endpoints ========================= */

// GET /api/cbt/admin/exams — every test published as a CBT exam, with stats
// (candidates, attempts, avg %, opens, last activity) for the dashboard.
export async function listCbtExams(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admins only." });
  await disableExpiredCbtExams();
  const tests = await TestSeries.find({ cbtEnabled: true, owner: null })
    .populate("practiceStream", "name")
    .populate("practiceSubject", "name")
    .sort("-updatedAt")
    .lean();
  const ids = tests.map((t) => t._id);
  const attempts = await CbtAttempt.find({ testSeries: { $in: ids } })
    .select("testSeries email percentage score createdAt").lean();
  const byTest = new Map();
  for (const a of attempts) {
    const k = String(a.testSeries);
    if (!byTest.has(k)) byTest.set(k, []);
    byTest.get(k).push(a);
  }
  res.json(
    tests.map((t) => {
      const list = byTest.get(String(t._id)) || [];
      const students = new Set(list.map((a) => (a.email || "").toLowerCase()));
      const avg = list.length ? Math.round(list.reduce((s, a) => s + (a.percentage || 0), 0) / list.length) : null;
      const last = list.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), null);
      return {
        _id: t._id,
        name: t.name,
        cbtToken: t.cbtToken,
        cbtExpiresAt: t.cbtExpiresAt || null,
        questionCount: t.questions?.length || 0,
        duration: t.duration,
        marks: t.marks,
        context: [t.practiceStream?.name, t.practiceSubject?.name].filter(Boolean).join(" › "),
        opens: t.cbtViews || 0,
        candidates: students.size,
        attempts: list.length,
        avgPercentage: avg,
        lastAttemptAt: last,
      };
    })
  );
}

// GET /api/cbt/admin/candidates — the admin's "My Tests" that can be pulled into
// a CBT exam (with how many are already published), for the Pull-test picker.
export async function listCbtCandidates(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admins only." });
  const tests = await TestSeries.find({ owner: null, practice: true, practiceKind: "test" })
    .populate("practiceStream", "name")
    .populate("practiceSubject", "name")
    .sort("-updatedAt")
    .lean();
  res.json(
    tests.map((t) => ({
      _id: t._id,
      name: t.name,
      questionCount: t.questions?.length || 0,
      duration: t.duration,
      marks: t.marks,
      context: [t.practiceStream?.name, t.practiceSubject?.name].filter(Boolean).join(" › "),
      cbtEnabled: !!t.cbtEnabled,
    }))
  );
}

// PATCH /api/cbt/admin/:id/publish — publish a My Test as a CBT exam. Generates
// the token once (kept stable) and optionally sets an expiry (close time).
export async function publishCbt(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admins only." });
  const test = await TestSeries.findOne({ _id: req.params.id, owner: null });
  if (!test) return res.status(404).json({ message: "Test not found." });
  if (!test.questions?.length) return res.status(400).json({ message: "Add questions to this test before publishing it as an exam." });

  test.cbtEnabled = true;
  if (!test.cbtToken) test.cbtToken = crypto.randomBytes(12).toString("hex");
  if ("expiresAt" in (req.body || {})) {
    if (!req.body.expiresAt) {
      test.cbtExpiresAt = null;
    } else {
      const d = new Date(req.body.expiresAt);
      if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid close date." });
      test.cbtExpiresAt = d;
    }
  }
  await test.save();
  res.json({ cbtEnabled: test.cbtEnabled, cbtToken: test.cbtToken, cbtExpiresAt: test.cbtExpiresAt });
}

// PATCH /api/cbt/admin/:id/unpublish — close a CBT exam (link stops working;
// stored attempts/rankings are kept).
export async function unpublishCbt(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admins only." });
  const test = await TestSeries.findOne({ _id: req.params.id, owner: null });
  if (!test) return res.status(404).json({ message: "Test not found." });
  test.cbtEnabled = false;
  await test.save();
  res.json({ cbtEnabled: false });
}

// GET /api/cbt/admin/:id/leaderboard — all candidates ranked (best attempt per
// student), for the admin rankings dashboard.
export async function cbtLeaderboard(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admins only." });
  const test = await TestSeries.findOne({ _id: req.params.id, owner: null }).select("name marks").lean();
  if (!test) return res.status(404).json({ message: "Test not found." });
  const all = await CbtAttempt.find({ testSeries: req.params.id })
    .select("name email score maxScore percentage correct incorrect attempted total timeTaken createdAt").lean();
  const board = rankBestPerStudent(all);
  res.json({
    name: test.name,
    totalAttempts: all.length,
    candidates: board.length,
    rows: board.map((a) => ({
      rank: a.rank,
      name: a.name,
      email: a.email,
      score: a.score,
      maxScore: a.maxScore,
      percentage: a.percentage,
      correct: a.correct,
      incorrect: a.incorrect,
      attempted: a.attempted,
      totalQ: a.total,
      timeTaken: a.timeTaken,
      at: a.createdAt,
    })),
  });
}

/* ===================== result email (HTML) ===================== */

// Build a self-contained HTML result email: score + rank summary, then a
// question-by-question breakdown (each option marked correct / the student's
// choice) with explanations, plus a link to the fully-rendered printable page.
function buildResultEmailHtml({ attempt, test, rank, candidates, resultToken }) {
  const review = attempt.review || [];
  const link = resultUrlFor(resultToken);
  const pct = attempt.percentage;

  const rows = review
    .map((r, i) => {
      const opts = (r.options || [])
        .map((opt, idx) => {
          const isCorrect = idx === r.correct;
          const isChosen = idx === r.chosen;
          const tag = isCorrect ? " ✓ correct" : isChosen ? " ✗ your answer" : "";
          const color = isCorrect ? "#047857" : isChosen ? "#be123c" : "#475569";
          const weight = isCorrect || isChosen ? "600" : "400";
          return `<div style="color:${color};font-weight:${weight};margin:2px 0">${esc(optLetter(idx))}. ${esc(opt)}${tag}</div>`;
        })
        .join("");
      const status = r.chosen == null ? "Skipped" : r.isCorrect ? "Correct" : "Wrong";
      const statusColor = r.chosen == null ? "#b45309" : r.isCorrect ? "#047857" : "#be123c";
      const expl = r.explanation
        ? `<div style="margin-top:6px;padding:8px;background:#eff6ff;border-radius:6px;font-size:13px"><b>Explanation:</b> ${esc(r.explanation)}</div>`
        : "";
      return `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:10px 0">
          <div style="display:flex;justify-content:space-between">
            <b style="font-size:14px">Q${i + 1}. ${esc(r.text)}</b>
          </div>
          <div style="font-size:12px;color:${statusColor};font-weight:700;margin:4px 0">${status}</div>
          <div style="font-size:13px">${opts}</div>
          ${expl}
        </div>`;
    })
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#0f172a">
    <h2 style="margin:0 0 4px">${esc(test.name)} — Your Result</h2>
    <p style="margin:0 0 12px;color:#475569">Hi ${esc(attempt.name)}, here is your full result.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:10px;background:#f1f5f9;border-radius:8px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#4f46e5">${attempt.score}/${attempt.maxScore ?? test.marks}</div>
          <div style="font-size:12px;color:#64748b">Score</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:10px;background:#f1f5f9;border-radius:8px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#4f46e5">${pct}%</div>
          <div style="font-size:12px;color:#64748b">Percentage</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:10px;background:#f1f5f9;border-radius:8px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#b45309">#${rank}${candidates ? ` / ${candidates}` : ""}</div>
          <div style="font-size:12px;color:#64748b">Rank</div>
        </td>
      </tr>
    </table>

    <p style="font-size:13px;color:#475569">
      Correct: <b>${attempt.correct}</b> · Wrong: <b>${attempt.incorrect}</b> · Skipped: <b>${attempt.skipped}</b> · Attempted: <b>${attempt.attempted}</b>/${attempt.total}
    </p>

    <p style="margin:14px 0">
      <a href="${esc(link)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">
        View &amp; download full result (PDF)
      </a>
    </p>
    <p style="font-size:12px;color:#64748b">Tip: open the link above and use your browser's “Print → Save as PDF” for a clean copy with proper maths/diagrams.</p>

    <h3 style="margin:18px 0 6px">Answers &amp; explanations</h3>
    ${rows}

    <p style="font-size:11px;color:#94a3b8;margin-top:18px">This result was generated automatically when you submitted the exam.</p>
  </div>`;
}

async function emailCbtResult({ attempt, test, rank, candidates, resultToken }) {
  if (!isMailConfigured()) return;
  const html = buildResultEmailHtml({ attempt, test, rank, candidates, resultToken });
  const text =
    `${test.name} — Your Result\n\n` +
    `Score: ${attempt.score}/${attempt.maxScore ?? test.marks} (${attempt.percentage}%)\n` +
    `Rank: #${rank}${candidates ? ` of ${candidates}` : ""}\n` +
    `Correct ${attempt.correct} · Wrong ${attempt.incorrect} · Skipped ${attempt.skipped}\n\n` +
    `View & download your full result: ${resultUrlFor(resultToken)}`;
  const ok = await sendMail({
    to: attempt.email,
    subject: `Your result — ${test.name} (Rank #${rank}${candidates ? `/${candidates}` : ""})`,
    text,
    html,
  });
  if (ok) CbtAttempt.updateOne({ _id: attempt._id }, { $set: { emailed: true } }).catch(() => {});
}
