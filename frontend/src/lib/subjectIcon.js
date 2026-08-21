// Map a subject NAME to a relevant logo automatically, so each subject shows a
// realistic, recognisable symbol instead of the same generic book.
//
// Each rule is [regex, lucideIconName, emoji, gradientColor]:
//  - emoji         → colourful, realistic glyph shown on the subject card
//  - lucideIconName→ line-icon fallback (also used for streams/topics)
//  - gradientColor → per-subject tile colour so cards look varied
//
// Unknown names fall back to a book, so this can never crash.
const DEFAULT_ICON = "BookOpen";
const DEFAULT_EMOJI = "📘";
const DEFAULT_COLOR = "from-violet-500 to-fuchsia-600";

const RULES = [
  [/account|ledger|book.?keep|commerce|audit|tally/i, "Calculator", "🧮", "from-amber-500 to-orange-600"],
  [/econom|micro|macro|trade|market|finance|bank|gdp/i, "TrendingUp", "📈", "from-emerald-500 to-teal-600"],
  [/business|management|\bmba\b|marketing|entrepreneur/i, "Briefcase", "💼", "from-yellow-500 to-amber-600"],
  [/biolog|botany|zoolog|life scien|physiolog|genetic|\bcell\b/i, "Dna", "🧬", "from-green-500 to-emerald-600"],
  [/chem/i, "FlaskConical", "⚗️", "from-cyan-500 to-blue-600"],
  [/physic/i, "Atom", "⚛️", "from-indigo-500 to-violet-600"],
  [/math|algebra|geometry|calculus|arithmetic|quant|numerical|mensuration/i, "Sigma", "➗", "from-blue-500 to-indigo-600"],
  [/reasoning|aptitude|logic|psycholog/i, "Brain", "🧠", "from-pink-500 to-rose-600"],
  [/comput|coding|program|software|\bit\b|informatics|data structure|cyber/i, "Cpu", "💻", "from-slate-600 to-slate-800"],
  [/environment|ecolog|pollution|nature|biodiversity/i, "Leaf", "🌿", "from-lime-500 to-green-600"],
  [/current affairs|general knowledge|\bgk\b|\bnews\b|awareness/i, "Newspaper", "📰", "from-rose-500 to-red-600"],
  [/english|grammar|vocab|literature|verbal|comprehension/i, "Languages", "🔤", "from-fuchsia-500 to-purple-600"],
  [/hindi|urdu|sanskrit|kashmiri|dogri|punjabi|arabic|persian|language/i, "Languages", "🗣️", "from-fuchsia-500 to-purple-600"],
  [/histor|ancient|medieval|civilization|freedom|dynasty|heritage/i, "Landmark", "🏛️", "from-amber-600 to-yellow-700"],
  [/geograph|\bmap\b|earth|physiograph|climate|river|terrain/i, "Globe", "🌍", "from-sky-500 to-cyan-600"],
  [/polit|civics|constitution|governance|polity|\blaw\b|legal|\bact\b/i, "Scale", "⚖️", "from-slate-500 to-gray-700"],
  [/nursing|medical|health|pharma|disease|clinical|anatomy/i, "Stethoscope", "🩺", "from-red-500 to-rose-600"],
  [/general scien|\bscience\b|ncert/i, "FlaskConical", "🔬", "from-teal-500 to-cyan-600"],
  [/exam|paper|mock|previous year|\bpyq\b|\b20\d\d\b/i, "GraduationCap", "🎓", "from-violet-500 to-fuchsia-600"],
];

function match(name) {
  const n = String(name || "");
  return RULES.find(([re]) => re.test(n)) || null;
}

export function subjectIconName(name) {
  return match(name)?.[1] || DEFAULT_ICON;
}
export function subjectEmoji(name) {
  return match(name)?.[2] || DEFAULT_EMOJI;
}
export function subjectColor(name) {
  return match(name)?.[3] || DEFAULT_COLOR;
}
