// Voice Studio helpers (kept apart from the components for fast refresh).

export const fmtSecs = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = n % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
export const totalSecs = (takes) => takes.reduce((a, t) => a + (Number(t.seconds) || 0), 0);

// Texts to read while recording — varied sentences (numbers, names, questions,
// explanations) so the clone learns how you sound in real quiz narration.
export const READING_SCRIPTS = [
  "Welcome to My Study Guide. Today we will practise twenty-five important questions for the JKSSB exam. Read each question carefully, think for a moment, and then check the answer with the explanation.",
  "Question one. Which article of the Constitution of India deals with the Right to Equality? Option A, Article fourteen. Option B, Article nineteen. Option C, Article twenty-one. Option D, Article thirty-two.",
  "The correct answer is option A, Article fourteen. It guarantees equality before the law and equal protection of the laws to every person within the territory of India.",
  "Vitamins are organic compounds that our body needs in small amounts. Vitamin C is found in citrus fruits like oranges and lemons, while vitamin D is made by the skin in sunlight.",
  "Jammu and Kashmir is known for its beautiful valleys, the Dal Lake, and the famous Mughal gardens. The Chenab, the Jhelum and the Ravi are some of its important rivers.",
  "Let us quickly revise. Fiscal policy is the use of government spending and taxation to influence the economy. Monetary policy, on the other hand, is managed by the Reserve Bank of India.",
  "Here is a quick tip! When two options look almost the same, read the question again and look for words like always, never, only, or except. These small words often decide the answer.",
  "Well done! You have completed today's quiz. If you found it useful, please like, share and subscribe for more daily practice. Small steps every day bring big results. See you in the next video.",
  "In the year nineteen forty-seven, India became independent. The Constitution was adopted on the twenty-sixth of November, nineteen forty-nine, and came into force on the twenty-sixth of January, nineteen fifty.",
  "Photosynthesis is the process by which green plants make their own food. They use sunlight, water and carbon dioxide, and they release oxygen into the air we breathe.",
];

let takeSeq = 0;
export const makeTake = (file, seconds, source) => ({ id: `t${Date.now()}-${++takeSeq}`, file, name: file.name, seconds, source, url: URL.createObjectURL(file) });
