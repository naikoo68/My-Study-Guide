import User from "../models/User.js";
import TestSeries from "../models/TestSeries.js";
import Attempt from "../models/Attempt.js";

// GET /api/admin/analytics  (admin) — platform-wide stats
export async function platformAnalytics(req, res) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [totalUsers, activeUsers, totalTests, totalAttempts] = await Promise.all([
    User.countDocuments(),
    Attempt.distinct("user", { createdAt: { $gte: since } }).then((a) => a.length),
    TestSeries.countDocuments(),
    Attempt.countDocuments(),
  ]);

  const planAgg = await User.aggregate([
    { $group: { _id: "$plan", count: { $sum: 1 } } },
  ]);

  const avgScoreAgg = await Attempt.aggregate([
    { $group: { _id: null, avg: { $avg: "$percentage" } } },
  ]);

  res.json({
    totalUsers,
    activeUsers,
    totalTests,
    totalAttempts,
    planDistribution: planAgg,
    avgScore: Math.round(avgScoreAgg[0]?.avg || 0),
  });
}

// GET /api/me/dashboard — current student's dashboard data
export async function studentDashboard(req, res) {
  const attempts = await Attempt.find({ user: req.user._id })
    .sort("-createdAt")
    .limit(10)
    .populate("testSeries", "name marks");

  const avg =
    attempts.reduce((s, a) => s + (a.percentage || 0), 0) /
    (attempts.length || 1);

  res.json({
    recentAttempts: attempts,
    avgPercentile: Math.round(avg),
    completedTests: attempts.length,
    streak: req.user.streak,
  });
}

// GET /api/leaderboard — top users by total score
export async function leaderboard(req, res) {
  const top = await Attempt.aggregate([
    { $group: { _id: "$user", totalScore: { $sum: "$score" } } },
    { $sort: { totalScore: -1 } },
    { $limit: 20 },
    {
      $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" },
    },
    { $unwind: "$user" },
    { $project: { name: "$user.name", totalScore: 1 } },
  ]);
  res.json(top);
}
