// Mock admin data. In production these are backed by admin-only REST endpoints.

export const adminUsers = [
  { id: "u1", name: "Aarav Sharma", email: "aarav@example.com", plan: "Premium", status: "active", joined: "2026-01-12", tests: 42 },
  { id: "u2", name: "Diya Patel", email: "diya@example.com", plan: "Free", status: "active", joined: "2026-02-03", tests: 18 },
  { id: "u3", name: "Vihaan Gupta", email: "vihaan@example.com", plan: "Premium", status: "blocked", joined: "2025-11-20", tests: 67 },
  { id: "u4", name: "Ananya Reddy", email: "ananya@example.com", plan: "Pro", status: "active", joined: "2026-03-15", tests: 30 },
  { id: "u5", name: "Kabir Singh", email: "kabir@example.com", plan: "Free", status: "active", joined: "2026-04-01", tests: 9 },
  { id: "u6", name: "Saanvi Joshi", email: "saanvi@example.com", plan: "Premium", status: "active", joined: "2026-04-22", tests: 51 },
];

export const adminQuestions = [
  { id: "q1", subject: "Physics", session: "Units & Measurements", text: "Which is a fundamental SI unit?", difficulty: "Easy", status: "published" },
  { id: "q2", subject: "Physics", session: "Motion", text: "Dimensional formula of force is?", difficulty: "Medium", status: "published" },
  { id: "q3", subject: "Chemistry", session: "Structure of Atom", text: "Number of electrons in carbon?", difficulty: "Easy", status: "draft" },
  { id: "q4", subject: "Mathematics", session: "Trigonometry", text: "Value of sin(90°)?", difficulty: "Easy", status: "published" },
  { id: "q5", subject: "Biology", session: "Cell: Unit of Life", text: "Powerhouse of the cell?", difficulty: "Easy", status: "published" },
];

export const adminTests = [
  { id: "at1", name: "JEE Main Full Mock 1", questions: 90, marks: 300, duration: 180, schedule: "2026-06-28", status: "published" },
  { id: "at2", name: "NEET Biology Subject Test", questions: 45, marks: 180, duration: 90, schedule: "2026-07-01", status: "published" },
  { id: "at3", name: "Maths PYQ 2025", questions: 38, marks: 80, duration: 180, schedule: "2026-07-10", status: "draft" },
  { id: "at4", name: "Weekend Grand Test #6", questions: 60, marks: 240, duration: 120, schedule: "2026-07-05", status: "scheduled" },
];

export const revenueMonthly = [42000, 51000, 48000, 63000, 72000, 89000];
export const attemptsMonthly = [1200, 1850, 1600, 2400, 3100, 4200];
