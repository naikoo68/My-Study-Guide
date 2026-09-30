import { describe, it, expect } from "vitest";
import { nextQuizVideo, pickLongVideoScheduleFields } from "../src/config/longVideo.js";

// 40 quizzes; Quiz 5 has 100 questions, Quiz 7 is empty, the rest 25.
const list = Array.from({ length: 40 }, (_, i) => ({ kind: "testSeries", id: String(i + 1).padStart(24, "a"), name: `Quiz ${i + 1}` }));
const counts = (q) => ({ "Quiz 5": 100, "Quiz 7": 0 }[q.name] ?? 25);

// Run the schedule slot by slot, exactly as runByQuizSchedule stores its position.
function walk({ quizStartId, per = 25, stopWhenExhausted = true, max = 200 }) {
  let pos = { quizId: "", quizIdx: 0, nextStart: 1 };
  const videos = [];
  for (let i = 0; i < max; i++) {
    const n = nextQuizVideo({ list, countOf: counts, quizStartId, per, stopWhenExhausted, ...pos });
    if (n.done) break;
    videos.push(`${n.item.name}${n.part ? ` (Part ${n.part})` : ""} Q${n.start}-${n.start + n.count - 1}`);
    const nextItem = list[n.nextIdx];
    pos = { quizId: nextItem ? nextItem.id : "__end__", quizIdx: n.nextIdx, nextStart: n.nextStart };
  }
  return videos;
}

describe("quiz by quiz through a topic", () => {
  it("starting at Quiz 3 skips Quiz 1–2 and publishes Quiz 3 … Quiz 40", () => {
    const v = walk({ quizStartId: list[2].id });
    expect(v[0]).toBe("Quiz 3 Q1-25");
    expect(v.some((x) => /^Quiz [12] /.test(x))).toBe(false);
    expect(v.at(-1)).toBe("Quiz 40 Q1-25");
    // 38 quizzes, minus the empty Quiz 7, with Quiz 5 as 4 parts → 37 + 3 = 40 videos
    expect(v).toHaveLength(40);
  });

  it("splits a 100-question quiz into Part 1…4, then moves on", () => {
    const v = walk({ quizStartId: list[2].id });
    expect(v.slice(2, 7)).toEqual(["Quiz 5 (Part 1) Q1-25", "Quiz 5 (Part 2) Q26-50", "Quiz 5 (Part 3) Q51-75", "Quiz 5 (Part 4) Q76-100", "Quiz 6 Q1-25"]);
  });

  it("skips an empty quiz", () => {
    const v = walk({ quizStartId: list[2].id });
    expect(v.some((x) => x.startsWith("Quiz 7 "))).toBe(false);
    expect(v[v.indexOf("Quiz 6 Q1-25") + 1]).toBe("Quiz 8 Q1-25");
  });

  it("a quiz of exactly 25 is one video with no Part", () => {
    expect(walk({ quizStartId: list[0].id })[0]).toBe("Quiz 1 Q1-25");
  });

  it("with 'stop when done' off it starts again from the start quiz", () => {
    const v = walk({ quizStartId: list[37].id, stopWhenExhausted: false, max: 5 });
    expect(v).toEqual(["Quiz 38 Q1-25", "Quiz 39 Q1-25", "Quiz 40 Q1-25", "Quiz 38 Q1-25", "Quiz 39 Q1-25"]);
  });

  it("a removed quiz: continues at the same position", () => {
    const shorter = list.filter((q) => q.name !== "Quiz 10");
    const n = nextQuizVideo({ list: shorter, countOf: counts, quizStartId: list[2].id, quizId: list[9].id, quizIdx: 9, nextStart: 1, per: 25 });
    expect(n.item.name).toBe("Quiz 11");
  });

  it("the schedule keeps its quiz position when re-saved", () => {
    const f = pickLongVideoScheduleFields({ byQuiz: true, quizStartId: list[2].id, quizId: list[4].id, quizIdx: 4, nextStart: 26 });
    expect(f).toMatchObject({ byQuiz: true, quizStartId: list[2].id, quizId: list[4].id, quizIdx: 4, nextStart: 26 });
    expect(pickLongVideoScheduleFields({ byQuiz: true, quizId: "__end__" }).quizId).toBe("__end__");
  });
});
