// Sample question bank. In production these come from the backend
// (GET /api/sessions/:id/questions). Each question has options, the
// index of the correct option, and an explanation shown after answering.

const bank = {
  "physics-s1": [
    {
      id: "q1",
      text: "Which of the following is a fundamental (base) SI unit?",
      options: ["Newton", "Kilogram", "Watt", "Pascal"],
      correct: 1,
      difficulty: "Easy",
      topic: "SI Units",
      explanation:
        "The kilogram (kg) is a base SI unit of mass. Newton, Watt and Pascal are derived units.",
    },
    {
      id: "q2",
      text: "The dimensional formula of force is:",
      options: ["[MLT⁻¹]", "[MLT⁻²]", "[ML²T⁻²]", "[M⁰LT⁻²]"],
      correct: 1,
      difficulty: "Medium",
      topic: "Dimensions",
      explanation:
        "Force = mass × acceleration = M × LT⁻² = [MLT⁻²].",
    },
    {
      id: "q3",
      text: "How many significant figures are there in 0.00450?",
      options: ["2", "3", "4", "5"],
      correct: 1,
      difficulty: "Medium",
      topic: "Significant Figures",
      explanation:
        "Leading zeros are not significant. The significant digits are 4, 5 and the trailing 0 → 3 significant figures.",
    },
    {
      id: "q4",
      text: "One light year is a unit of:",
      options: ["Time", "Distance", "Speed", "Intensity"],
      correct: 1,
      difficulty: "Easy",
      topic: "Units",
      explanation:
        "A light year is the distance light travels in one year (~9.46 × 10¹⁵ m). It measures distance, not time.",
    },
    {
      id: "q5",
      text: "Parallax method is primarily used to measure:",
      options: [
        "Mass of the Earth",
        "Distance of nearby stars",
        "Speed of light",
        "Atomic radius",
      ],
      correct: 1,
      difficulty: "Hard",
      topic: "Measurement",
      explanation:
        "The parallax method uses the apparent shift of a nearby star against distant stars to estimate astronomical distances.",
    },
  ],
};

// A generic fallback set so every session is playable in the demo.
function genericQuestions(sessionId) {
  return Array.from({ length: 8 }).map((_, i) => ({
    id: `${sessionId}-gq${i + 1}`,
    text: `Sample question ${i + 1}: Which option correctly completes this concept check?`,
    options: [
      "First plausible option",
      "Second plausible option",
      "Correct conceptual answer",
      "Distractor option",
    ],
    correct: 2,
    difficulty: ["Easy", "Medium", "Hard"][i % 3],
    topic: ["Core Concept", "Application", "Analysis"][i % 3],
    explanation:
      "This is a demo explanation. In the live product, the admin adds detailed solutions with images, formulas and references for each question.",
  }));
}

export function getQuestions(sessionId) {
  return bank[sessionId] || genericQuestions(sessionId);
}
