// Catalog of common subjects grouped by academic stream.
//
// Powers the "search subjects for this stream" suggestions shown in the admin
// Add-Subject form (see AdminContent.jsx -> FormModal). When an admin creates a
// stream like "Arts and Humanities" and then adds subjects under it, we match
// the stream name against this catalog and suggest the subjects that typically
// belong to it, auto-filling name / icon / colour / description on pick.
//
// This is purely a front-end convenience list — the admin can still type any
// custom subject name. Icons are lucide-react names; colours are Tailwind
// gradient classes (same palette used elsewhere in Content Management).

// Each entry: { key, label, aliases:[], keywords:[], subjects:[{name, icon, color, description}] }
export const STREAM_SUBJECTS = [
  {
    key: "arts-humanities",
    label: "Arts and Humanities",
    aliases: ["arts", "humanities", "arts and humanities", "arts & humanities", "liberal arts"],
    keywords: ["art", "arts", "humanit", "liberal"],
    subjects: [
      { name: "History", icon: "ScrollText", color: "from-yellow-600 to-amber-700", description: "Ancient, medieval and modern history." },
      { name: "Geography", icon: "Globe2", color: "from-cyan-500 to-teal-600", description: "Physical, human and economic geography." },
      { name: "Political Science", icon: "Landmark", color: "from-indigo-500 to-blue-700", description: "Political theory, constitution and governance." },
      { name: "Sociology", icon: "Users", color: "from-rose-500 to-pink-600", description: "Society, social institutions and change." },
      { name: "Psychology", icon: "Brain", color: "from-violet-500 to-purple-600", description: "Human behaviour, cognition and mental processes." },
      { name: "Philosophy", icon: "Lightbulb", color: "from-amber-500 to-orange-600", description: "Logic, ethics and theories of knowledge." },
      { name: "Economics", icon: "TrendingUp", color: "from-amber-500 to-orange-600", description: "Micro, macro and the Indian economy." },
      { name: "English Literature", icon: "BookOpen", color: "from-fuchsia-500 to-purple-600", description: "Prose, poetry, drama and literary criticism." },
      { name: "Fine Arts", icon: "Palette", color: "from-rose-500 to-pink-600", description: "Drawing, painting and visual arts." },
      { name: "Public Administration", icon: "Building2", color: "from-slate-600 to-slate-800", description: "Governance, policy and administrative theory." },
      { name: "Home Science", icon: "Home", color: "from-emerald-500 to-teal-600", description: "Nutrition, human development and resource management." },
      { name: "Music", icon: "Music", color: "from-sky-500 to-blue-600", description: "Theory, history and practice of music." },
      { name: "Sanskrit", icon: "Languages", color: "from-yellow-600 to-amber-700", description: "Classical Sanskrit language and literature." },
      { name: "Hindi", icon: "Languages", color: "from-orange-500 to-red-600", description: "Hindi language, grammar and literature." },
    ],
  },
  {
    key: "science",
    label: "Science",
    aliases: ["science", "sciences", "pcm", "pcb", "pcmb", "medical", "non-medical", "neet", "jee"],
    keywords: ["scien", "pcm", "pcb", "medical", "neet", "jee"],
    subjects: [
      { name: "Physics", icon: "Atom", color: "from-blue-500 to-indigo-600", description: "Mechanics, thermodynamics, optics and modern physics." },
      { name: "Chemistry", icon: "FlaskConical", color: "from-emerald-500 to-teal-600", description: "Physical, organic and inorganic chemistry." },
      { name: "Biology", icon: "Dna", color: "from-green-500 to-lime-600", description: "Cell biology, genetics, physiology and ecology." },
      { name: "Mathematics", icon: "Sigma", color: "from-violet-500 to-purple-600", description: "Algebra, calculus, trigonometry and statistics." },
      { name: "Botany", icon: "Leaf", color: "from-green-500 to-lime-600", description: "Plant structure, physiology and diversity." },
      { name: "Zoology", icon: "Bug", color: "from-emerald-500 to-teal-600", description: "Animal biology, anatomy and classification." },
      { name: "Computer Science", icon: "Cpu", color: "from-slate-600 to-slate-800", description: "Programming, data structures and computing." },
      { name: "Statistics", icon: "BarChart3", color: "from-cyan-500 to-teal-600", description: "Data, probability and statistical inference." },
      { name: "Biotechnology", icon: "Microscope", color: "from-green-500 to-lime-600", description: "Genetic engineering and applied biology." },
      { name: "Electronics", icon: "CircuitBoard", color: "from-blue-500 to-indigo-600", description: "Circuits, semiconductors and devices." },
    ],
  },
  {
    key: "commerce",
    label: "Commerce",
    aliases: ["commerce", "business", "commerce and business", "accounts"],
    keywords: ["commerc", "business", "account", "finance"],
    subjects: [
      { name: "Accountancy", icon: "Calculator", color: "from-rose-500 to-pink-600", description: "Financial statements, partnership and company accounts." },
      { name: "Business Studies", icon: "Briefcase", color: "from-sky-500 to-blue-600", description: "Management, marketing and business environment." },
      { name: "Economics", icon: "TrendingUp", color: "from-amber-500 to-orange-600", description: "Micro, macro and the Indian economy." },
      { name: "Business Mathematics", icon: "Sigma", color: "from-violet-500 to-purple-600", description: "Commercial arithmetic and quantitative methods." },
      { name: "Statistics", icon: "BarChart3", color: "from-cyan-500 to-teal-600", description: "Data, probability and statistical inference." },
      { name: "Entrepreneurship", icon: "Rocket", color: "from-amber-500 to-orange-600", description: "Starting and running a business venture." },
      { name: "Banking", icon: "Landmark", color: "from-indigo-500 to-blue-700", description: "Banking operations, instruments and regulation." },
      { name: "Finance", icon: "DollarSign", color: "from-emerald-500 to-teal-600", description: "Corporate finance and financial management." },
    ],
  },
  {
    key: "computer-it",
    label: "Computer Science / IT",
    aliases: ["computer science", "computer", "it", "information technology", "cs", "computers"],
    keywords: ["comput", "informat", "software"],
    subjects: [
      { name: "Programming Fundamentals", icon: "Code", color: "from-slate-600 to-slate-800", description: "Core programming concepts and logic." },
      { name: "Data Structures", icon: "Binary", color: "from-blue-500 to-indigo-600", description: "Arrays, lists, trees, graphs and algorithms." },
      { name: "Databases", icon: "Database", color: "from-emerald-500 to-teal-600", description: "DBMS, SQL and data modelling." },
      { name: "Computer Networks", icon: "Network", color: "from-cyan-500 to-teal-600", description: "Protocols, layers and network devices." },
      { name: "Operating Systems", icon: "Cpu", color: "from-slate-600 to-slate-800", description: "Processes, memory and file systems." },
      { name: "Web Development", icon: "Globe2", color: "from-sky-500 to-blue-600", description: "HTML, CSS, JavaScript and web apps." },
    ],
  },
];

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Find the catalog entry whose name/aliases/keywords best match a stream name.
// Returns null when nothing matches (caller can then fall back to "all").
export function matchStream(streamName) {
  const n = normalize(streamName);
  if (!n) return null;

  // 1) exact label / alias match
  for (const entry of STREAM_SUBJECTS) {
    if (normalize(entry.label) === n) return entry;
    if (entry.aliases.some((a) => normalize(a) === n)) return entry;
  }
  // 2) alias contained in the stream name (or vice-versa)
  for (const entry of STREAM_SUBJECTS) {
    if (entry.aliases.some((a) => { const na = normalize(a); return na && (n.includes(na) || na.includes(n)); })) return entry;
  }
  // 3) keyword substring match
  for (const entry of STREAM_SUBJECTS) {
    if (entry.keywords.some((k) => n.includes(k))) return entry;
  }
  return null;
}

// De-duplicated list of every subject across all streams (used as a fallback
// when the stream name doesn't match a known stream).
function allSubjects() {
  const seen = new Set();
  const out = [];
  for (const entry of STREAM_SUBJECTS) {
    for (const s of entry.subjects) {
      const key = s.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Suggest subjects for a stream, optionally filtered by a search query.
// Returns { matched: bool, streamLabel: string|null, subjects: [...] }.
export function suggestSubjects(streamName, query = "") {
  const entry = matchStream(streamName);
  const base = entry ? entry.subjects : allSubjects();
  const q = normalize(query);
  const subjects = q ? base.filter((s) => normalize(s.name).includes(q)) : base;
  return {
    matched: !!entry,
    streamLabel: entry ? entry.label : null,
    subjects,
  };
}
