import User from "../models/User.js";
import TestSeries from "../models/TestSeries.js";
import Attempt from "../models/Attempt.js";
import Quiz from "../models/Quiz.js";
import Question from "../models/Question.js";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";

// GET /api/stats — public, live counts for the Home/About statistics section.
// Recomputed on every request, so it updates the moment a user registers or
// content is added. Any of these keys can be bound to a stat row in admin.
export async function publicStats(req, res) {
  const [students, users, quizzes, tests, questions, subjects, topics, attempts] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments(),
    Quiz.countDocuments(),
    TestSeries.countDocuments(),
    Question.countDocuments(),
    Subject.countDocuments(),
    Topic.countDocuments(),
    Attempt.countDocuments(),
  ]);
  res.json({ students, users, quizzes, tests, questions, subjects, topics, attempts });
}

const initials = (name = "") =>
  name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

// GET /api/admin/analytics  (admin) — platform-wide stats
export async function platformAnalytics(req, res) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [totalUsers, activeUsers, totalTests, totalAttempts] = await Promise.all([
    User.countDocuments(),
    Attempt.distinct("user", { createdAt: { $gte: since } }).then((a) => a.length),
    TestSeries.countDocuments(),
    Attempt.countDocuments(),
  ]);

  const planAgg = await User.aggregate([{ $group: { _id: "$plan", count: { $sum: 1 } } }]);
  const avgScoreAgg = await Attempt.aggregate([{ $group: { _id: null, avg: { $avg: "$percentage" } } }]);

  res.json({
    totalUsers,
    activeUsers,
    totalTests,
    totalAttempts,
    planDistribution: planAgg,
    avgScore: Math.round(avgScoreAgg[0]?.avg || 0),
  });
}

// GET /api/me/dashboard — everything the student dashboard needs in one call.
export async function studentDashboard(req, res) {
  const user = req.user;

  const [attempts, enrolled, upcoming] = await Promise.all([
    Attempt.find({ user: user._id }).sort("-createdAt").limit(10).populate("testSeries", "name marks"),
    TestSeries.find({ _id: { $in: user.enrolledTests || [] } }).select("name questions marks duration difficulty"),
    TestSeries.find({ schedule: { $gte: new Date() }, status: { $in: ["scheduled", "published"] } })
      .sort("schedule")
      .limit(3)
      .select("name schedule"),
  ]);

  const recentScores = attempts.map((a) => ({
    id: a._id,
    name: a.testSeries?.name || "Quiz",
    score: a.score,
    total: a.testSeries?.marks || a.maxScore || a.total * 4,
    date: new Date(a.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    percentile: a.percentage,
  }));

  const avgPercentile = Math.round(
    attempts.reduce((s, a) => s + (a.percentage || 0), 0) / (attempts.length || 1)
  );

  const performanceTrend = [...attempts]
    .reverse()
    .map((a) => ({
      label: new Date(a.createdAt).toLocaleDateString("en-IN", { month: "short", day: "2-digit" }),
      value: a.percentage,
    }));

  res.json({
    profile: {
      name: user.name,
      email: user.email,
      avatar: user.avatar || initials(user.name),
      streak: user.streak,
      plan: user.plan,
    },
    stats: {
      enrolled: enrolled.length,
      upcoming: upcoming.length,
      completed: attempts.length,
      avgPercentile,
    },
    enrolledSeries: enrolled,
    upcomingTests: upcoming.map((t) => ({
      id: t._id,
      name: t.name,
      date: t.schedule ? new Date(t.schedule).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "TBA",
    })),
    recentScores,
    performanceTrend,
  });
}

// GET /api/admin/performance  (admin) — who took what + rankings.
// Returns per-user aggregates (for the ranking tables, sortable by combined /
// quizzes / tests) plus the recent attempts feed (who took which quiz/test).
export async function adminPerformance(req, res) {
  const users = await Attempt.aggregate([
    {
      $group: {
        _id: "$user",
        quizzes: { $sum: { $cond: [{ $eq: ["$type", "quiz"] }, 1, 0] } },
        tests: { $sum: { $cond: [{ $eq: ["$type", "test"] }, 1, 0] } },
        taken: { $sum: 1 },
        totalScore: { $sum: "$score" },
        quizScore: { $sum: { $cond: [{ $eq: ["$type", "quiz"] }, "$score", 0] } },
        testScore: { $sum: { $cond: [{ $eq: ["$type", "test"] }, "$score", 0] } },
        avgPct: { $avg: "$percentage" },
        lastAt: { $max: "$createdAt" },
      },
    },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $match: { "user.role": "student" } },
    { $sort: { taken: -1, totalScore: -1 } },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        name: "$user.name",
        email: "$user.email",
        quizzes: 1,
        tests: 1,
        taken: 1,
        totalScore: 1,
        quizScore: 1,
        testScore: 1,
        avgPct: { $round: ["$avgPct", 0] },
        lastAt: 1,
      },
    },
  ]);

  const recent = await Attempt.find()
    .sort("-createdAt")
    .limit(300)
    .populate("user", "name email role")
    .populate("quiz", "title")
    .populate("testSeries", "name")
    .lean();

  const attempts = recent
    .filter((a) => a.user) // skip attempts whose user was deleted
    .map((a) => ({
      _id: a._id,
      userId: a.user._id,
      userName: a.user.name,
      email: a.user.email,
      type: a.type,
      title: a.type === "test" ? a.testSeries?.name || "Test" : a.quiz?.title || "Quiz",
      score: a.score,
      percentage: a.percentage,
      correct: a.correct,
      total: a.total,
      createdAt: a.createdAt,
    }));

  res.json({ users, attempts });
}

// GET /api/admin/performance/user/:userId  (admin) — one user's full history
export async function userPerformanceDetail(req, res) {
  const user = await User.findById(req.params.userId).select("name email createdAt");
  if (!user) return res.status(404).json({ message: "User not found" });

  const list = await Attempt.find({ user: req.params.userId })
    .sort("-createdAt")
    .populate("quiz", "title")
    .populate("testSeries", "name")
    .lean();

  const attempts = list.map((a) => ({
    _id: a._id,
    type: a.type,
    title: a.type === "test" ? a.testSeries?.name || "Test" : a.quiz?.title || "Quiz",
    score: a.score,
    percentage: a.percentage,
    correct: a.correct,
    incorrect: a.incorrect,
    attempted: a.attempted,
    total: a.total,
    timeTaken: a.timeTaken,
    createdAt: a.createdAt,
  }));

  const quizzes = attempts.filter((a) => a.type === "quiz").length;
  const tests = attempts.filter((a) => a.type === "test").length;
  const avgPct = attempts.length ? Math.round(attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length) : 0;
  const totalScore = attempts.reduce((s, a) => s + (a.score || 0), 0);
  const best = attempts.reduce((m, a) => Math.max(m, a.percentage || 0), 0);

  res.json({
    user: { name: user.name, email: user.email, joined: user.createdAt },
    summary: { quizzes, tests, taken: attempts.length, avgPct, totalScore, best },
    attempts,
  });
}

// DELETE /api/admin/performance/user/:userId  (admin) — clear one user's history
export async function clearUserPerformance(req, res) {
  const { deletedCount } = await Attempt.deleteMany({ user: req.params.userId });
  res.json({ message: "User performance cleared", deleted: deletedCount });
}

// DELETE /api/admin/performance  (admin) — clear ALL attempt history
export async function clearAllPerformance(req, res) {
  const { deletedCount } = await Attempt.deleteMany({});
  res.json({ message: "All performance cleared", deleted: deletedCount });
}

// GET /api/leaderboard — ranks registered students by activity
// (quizzes + tests taken), with total score as the tie-breaker.
export async function leaderboard(req, res) {
  const top = await Attempt.aggregate([
    {
      $group: {
        _id: "$user",
        quizzes: { $sum: { $cond: [{ $eq: ["$type", "quiz"] }, 1, 0] } },
        tests: { $sum: { $cond: [{ $eq: ["$type", "test"] }, 1, 0] } },
        taken: { $sum: 1 },
        totalScore: { $sum: "$score" },
      },
    },
    // Only rank real registered students (exclude admins / deleted users).
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $match: { "user.role": "student" } },
    { $sort: { taken: -1, totalScore: -1 } },
    { $limit: 20 },
    { $project: { name: "$user.name", quizzes: 1, tests: 1, taken: 1, totalScore: 1 } },
  ]);

  const currentId = req.user?._id?.toString();
  const rows = top.map((row, i) => ({
    rank: i + 1,
    name: row._id.toString() === currentId ? "You" : row.name,
    avatar: initials(row.name),
    quizzes: row.quizzes,
    tests: row.tests,
    taken: row.taken,
    score: row.totalScore,
    isCurrentUser: row._id.toString() === currentId,
  }));
  res.json(rows);
}
