// Static catalog of subjects used across the Quiz module.
// In production this is served by the backend (GET /api/subjects).

export const subjects = [
  {
    id: "physics",
    name: "Physics",
    icon: "Atom",
    color: "from-blue-500 to-indigo-600",
    chapters: 5,
    description: "Mechanics, thermodynamics, optics and modern physics.",
  },
  {
    id: "chemistry",
    name: "Chemistry",
    icon: "FlaskConical",
    color: "from-emerald-500 to-teal-600",
    chapters: 5,
    description: "Physical, organic and inorganic chemistry essentials.",
  },
  {
    id: "biology",
    name: "Biology",
    icon: "Dna",
    color: "from-green-500 to-lime-600",
    chapters: 5,
    description: "Cell biology, genetics, human physiology and ecology.",
  },
  {
    id: "mathematics",
    name: "Mathematics",
    icon: "Sigma",
    color: "from-violet-500 to-purple-600",
    chapters: 5,
    description: "Algebra, calculus, trigonometry and statistics.",
  },
  {
    id: "economics",
    name: "Economics",
    icon: "TrendingUp",
    color: "from-amber-500 to-orange-600",
    chapters: 4,
    description: "Micro and macro economics with Indian economy.",
  },
  {
    id: "accountancy",
    name: "Accountancy",
    icon: "Calculator",
    color: "from-rose-500 to-pink-600",
    chapters: 4,
    description: "Financial statements, partnership and company accounts.",
  },
  {
    id: "business-studies",
    name: "Business Studies",
    icon: "Briefcase",
    color: "from-sky-500 to-blue-600",
    chapters: 4,
    description: "Management, marketing and business environment.",
  },
  {
    id: "history",
    name: "History",
    icon: "ScrollText",
    color: "from-yellow-600 to-amber-700",
    chapters: 4,
    description: "Ancient, medieval and modern world history.",
  },
  {
    id: "geography",
    name: "Geography",
    icon: "Globe2",
    color: "from-cyan-500 to-teal-600",
    chapters: 4,
    description: "Physical, human and economic geography.",
  },
  {
    id: "political-science",
    name: "Political Science",
    icon: "Landmark",
    color: "from-indigo-500 to-blue-700",
    chapters: 4,
    description: "Political theory, constitution and governance.",
  },
  {
    id: "english",
    name: "English",
    icon: "BookOpen",
    color: "from-fuchsia-500 to-purple-600",
    chapters: 4,
    description: "Grammar, comprehension, writing and literature.",
  },
  {
    id: "computer-science",
    name: "Computer Science",
    icon: "Cpu",
    color: "from-slate-600 to-slate-800",
    chapters: 5,
    description: "Programming, data structures, networks and DBMS.",
  },
];

const difficulties = ["Easy", "Medium", "Hard"];

// Generate deterministic sessions per subject.
const sessionTitles = {
  physics: [
    "Units & Measurements",
    "Motion",
    "Laws of Motion",
    "Work, Energy & Power",
    "Gravitation",
  ],
  chemistry: [
    "Some Basic Concepts",
    "Structure of Atom",
    "Chemical Bonding",
    "States of Matter",
    "Thermodynamics",
  ],
  biology: [
    "The Living World",
    "Cell: Unit of Life",
    "Plant Physiology",
    "Human Physiology",
    "Genetics & Evolution",
  ],
  mathematics: [
    "Sets & Relations",
    "Trigonometry",
    "Sequences & Series",
    "Limits & Derivatives",
    "Probability",
  ],
  economics: [
    "Introduction to Economics",
    "Consumer Equilibrium",
    "National Income",
    "Money & Banking",
  ],
  accountancy: [
    "Accounting Equation",
    "Journal & Ledger",
    "Depreciation",
    "Partnership Accounts",
  ],
  "business-studies": [
    "Nature of Management",
    "Principles of Management",
    "Business Environment",
    "Marketing Management",
  ],
  history: [
    "Ancient Civilizations",
    "Medieval India",
    "Modern India",
    "World Wars",
  ],
  geography: [
    "The Earth & Landforms",
    "Climate & Weather",
    "Population",
    "Economic Geography",
  ],
  "political-science": [
    "Political Theory",
    "Indian Constitution",
    "Rights & Duties",
    "Federalism",
  ],
  english: [
    "Grammar Basics",
    "Reading Comprehension",
    "Writing Skills",
    "Literature",
  ],
  "computer-science": [
    "Programming Fundamentals",
    "Data Structures",
    "Databases",
    "Computer Networks",
    "Operating Systems",
  ],
};

export function getSessions(subjectId) {
  const titles = sessionTitles[subjectId] || [];
  return titles.map((title, i) => ({
    id: `${subjectId}-s${i + 1}`,
    index: i + 1,
    subjectId,
    title,
    questions: 10 + ((i * 5) % 15),
    difficulty: difficulties[i % difficulties.length],
    progress: [0, 35, 60, 100, 20][i % 5],
  }));
}

export function getSubject(subjectId) {
  return subjects.find((s) => s.id === subjectId);
}
