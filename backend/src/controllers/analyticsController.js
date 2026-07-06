import User from "../models/User.js";
import TestSeries from "../models/TestSeries.js";
import Attempt from "../models/Attempt.js";

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
