// Test series catalog used by the Test Series module and Dashboard.

export const testSeries = [
  {
    id: "ts1",
    name: "JEE Main Full Mock Test 1",
    category: "Full-Length",
    duration: 180,
    questions: 90,
    marks: 300,
    difficulty: "Hard",
    enrolled: true,
    attempts: 12450,
  },
  {
    id: "ts2",
    name: "NEET Biology Subject Test",
    category: "Subject-wise",
    duration: 90,
    questions: 45,
    marks: 180,
    difficulty: "Medium",
    enrolled: true,
    attempts: 8930,
  },
  {
    id: "ts3",
    name: "Physics: Laws of Motion (Chapter Test)",
    category: "Chapter-wise",
    duration: 30,
    questions: 20,
    marks: 80,
    difficulty: "Medium",
    enrolled: false,
    attempts: 5120,
  },
  {
    id: "ts4",
    name: "CBSE Class 12 Maths — 2024 PYQ",
    category: "Previous Year",
    duration: 180,
    questions: 38,
    marks: 80,
    difficulty: "Hard",
    enrolled: false,
    attempts: 6720,
  },
  {
    id: "ts5",
    name: "Chemistry Full Syllabus Grand Test",
    category: "Full-Length",
    duration: 120,
    questions: 60,
    marks: 240,
    difficulty: "Hard",
    enrolled: true,
    attempts: 4310,
  },
  {
    id: "ts6",
    name: "Economics Micro — Chapter Test",
    category: "Chapter-wise",
    duration: 25,
    questions: 15,
    marks: 60,
    difficulty: "Easy",
    enrolled: false,
    attempts: 2980,
  },
  {
    id: "ts7",
    name: "Business Studies Subject Test",
    category: "Subject-wise",
    duration: 60,
    questions: 40,
    marks: 100,
    difficulty: "Medium",
    enrolled: false,
    attempts: 3450,
  },
  {
    id: "ts8",
    name: "NEET 2023 — Full Previous Year Paper",
    category: "Previous Year",
    duration: 200,
    questions: 180,
    marks: 720,
    difficulty: "Hard",
    enrolled: true,
    attempts: 15600,
  },
];

export const testCategories = [
  "All",
  "Full-Length",
  "Subject-wise",
  "Chapter-wise",
  "Previous Year",
];

export const upcomingTests = [
  { id: "u1", name: "All India Mock Test #14", date: "2026-06-28", time: "10:00 AM", seats: 12000 },
  { id: "u2", name: "Physics Sprint Test", date: "2026-06-30", time: "06:00 PM", seats: 4500 },
  { id: "u3", name: "Weekend Grand Test", date: "2026-07-05", time: "09:00 AM", seats: 20000 },
];

export const recentScores = [
  { id: "r1", name: "Chemistry Grand Test", score: 198, total: 240, date: "Jun 18", percentile: 92.4 },
  { id: "r2", name: "NEET Biology Subject Test", score: 156, total: 180, date: "Jun 14", percentile: 88.1 },
  { id: "r3", name: "JEE Main Full Mock 1", score: 210, total: 300, date: "Jun 10", percentile: 95.7 },
  { id: "r4", name: "Maths PYQ 2024", score: 68, total: 80, date: "Jun 06", percentile: 90.2 },
];

export const leaderboard = [
  { rank: 1, name: "Aarav Sharma", score: 9840, avatar: "AS", change: "up" },
  { rank: 2, name: "Diya Patel", score: 9720, avatar: "DP", change: "up" },
  { rank: 3, name: "Vihaan Gupta", score: 9650, avatar: "VG", change: "down" },
  { rank: 4, name: "Ananya Reddy", score: 9510, avatar: "AR", change: "same" },
  { rank: 5, name: "You", score: 9380, avatar: "ME", change: "up", isCurrentUser: true },
  { rank: 6, name: "Kabir Singh", score: 9210, avatar: "KS", change: "down" },
  { rank: 7, name: "Saanvi Joshi", score: 9120, avatar: "SJ", change: "up" },
];

export const notifications = [
  { id: "n1", title: "New Test Series Added", body: "JEE Advanced 2026 mock series is now live.", time: "2h ago", unread: true },
  { id: "n2", title: "Result Published", body: "Your Chemistry Grand Test result is ready.", time: "1d ago", unread: true },
  { id: "n3", title: "Streak Milestone", body: "You're on a 7-day practice streak! Keep going.", time: "2d ago", unread: false },
];
