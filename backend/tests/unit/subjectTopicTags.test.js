import { describe, it, expect } from "vitest";
import { hashtagsForQuestion } from "../../src/config/facebook.js";
import { buildYtTags } from "../../src/config/youtube.js";

// The admin's 30 default tags (as on the channel) — alone they fill the cap.
const DEFAULTS = "#MyStudyGuide #jkssbaccountsassistant #jkssb #jkssrb #CompetitiveExams #CompetitiveExamination #ExamPreparation #ExamPrep #GovernmentJobs #GovernmentExams #GovtJobs #SarkariJobs #SarkariNaukri #SarkariExam #JobPreparation #Aspirants #ExamAspirants #StudyMaterial #StudyOnline #OnlineLearning #MockTests #MockTest #TestSeries #QuestionBank #MCQ #MCQs #Quiz #OnlineQuiz #PracticeQuestions #PreviousYearQuestions";
// No ids → no database lookups; the topic comes from the question itself.
const q = { topic: "A) Characteristics and Problems of Developing Economy" };

describe("subject & topic tags are always added", () => {
  it("are kept even when the default tags already fill the 30-tag cap", async () => {
    const tags = (await hashtagsForQuestion(q, { fbDefaultHashtags: DEFAULTS })).split(" ");
    expect(tags).toHaveLength(30);
    expect(tags[0]).toBe("#CharacteristicsAndProblemsOfDevelopingEconomy"); // no "A)"
    expect(tags).toContain("#MyStudyGuide");
  });
  it("tags typed for this post still come first", async () => {
    const tags = (await hashtagsForQuestion(q, { fbDefaultHashtags: DEFAULTS }, "#Economics")).split(" ");
    expect(tags.slice(0, 2)).toEqual(["#Economics", "#CharacteristicsAndProblemsOfDevelopingEconomy"]);
  });
  it("switching auto hashtags off leaves them out", async () => {
    const out = await hashtagsForQuestion(q, { fbDefaultHashtags: "#GK", fbAutoHashtags: false });
    expect(out).toBe("#GK");
  });
});

describe("YouTube tags: subject & topic as readable tags, first", () => {
  it("puts the names in front and doesn't repeat them as #CamelCase", () => {
    const tags = buildYtTags("#Economics #CharacteristicsAndProblemsOfDevelopingEconomy " + DEFAULTS, { first: ["Economics", "Characteristics and Problems of Developing Economy"] });
    expect(tags.slice(0, 2)).toEqual(["Economics", "Characteristics and Problems of Developing Economy"]);
    expect(tags.filter((t) => /^economics$/i.test(t))).toHaveLength(1);
    expect(tags).not.toContain("CharacteristicsAndProblemsOfDevelopingEconomy");
    expect(tags).toContain("MyStudyGuide");
    expect(tags.reduce((n, t) => n + t.length + (/\s/.test(t) ? 3 : 1), 0)).toBeLessThanOrEqual(500);
  });
});
