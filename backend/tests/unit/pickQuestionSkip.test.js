import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared, hoisted fake "questions collection" the mocked model reads from.
const state = vi.hoisted(() => ({ DB: [] }));

// Mock the Question model with just the query surface pickQuestionForSchedule
// uses: countDocuments(filter), findOne(filter).sort().lean() /.skip(n).lean(),
// and findById(id).lean(). We honour `status` and the `_id: { $nin }` exclusion
// (the only filter parts the skip logic depends on).
vi.mock("../../src/models/Question.js", () => {
  const matches = (q, filter = {}) => {
    if (filter.status && q.status !== filter.status) return false;
    const nin = filter._id?.$nin;
    if (Array.isArray(nin) && nin.some((id) => String(id) === String(q._id))) return false;
    return true;
  };
  const Question = {
    countDocuments: vi.fn(async (filter = {}) => state.DB.filter((q) => matches(q, filter)).length),
    findOne: vi.fn((filter = {}) => {
      const list = state.DB.filter((q) => matches(q, filter));
      return {
        sort: () => ({ lean: async () => list[0] || null }),
        skip: (n) => ({ lean: async () => list[n] || list[0] || null }),
      };
    }),
    findById: vi.fn((id) => ({ lean: async () => state.DB.find((q) => String(q._id) === String(id)) || null })),
  };
  return { default: Question };
});

const { pickQuestionForSchedule } = await import("../../src/config/facebook.js");

const complete = (id) => ({ _id: id, status: "published", type: "mcq", text: `Q${id}`, options: ["a", "b", "c", "d"], correct: 1 });
const incomplete = (id) => ({ _id: id, status: "published", type: "mcq", text: `Q${id}`, options: ["a", "", "c", "d"], correct: 1 });

// Sequential order keeps selection deterministic (always the first match).
const schedule = () => ({ source: { quiz: "QUIZ1" }, order: "sequential", postedQuestionIds: [], stopWhenExhausted: true });

beforeEach(() => { state.DB = []; });

describe("pickQuestionForSchedule — skips incomplete questions", () => {
  it("skips a leading incomplete question and returns the next complete one", async () => {
    state.DB = [incomplete("1"), complete("2"), complete("3")];
    const r = await pickQuestionForSchedule(schedule());
    expect(r.q?._id).toBe("2");
    expect(r.skipped).toBe(1);
  });

  it("returns the first question when it is already complete (nothing skipped)", async () => {
    state.DB = [complete("1"), complete("2")];
    const r = await pickQuestionForSchedule(schedule());
    expect(r.q?._id).toBe("1");
    expect(r.skipped).toBe(0);
  });

  it("skips several incomplete questions to reach a complete one", async () => {
    state.DB = [incomplete("1"), incomplete("2"), incomplete("3"), complete("4")];
    const r = await pickQuestionForSchedule(schedule());
    expect(r.q?._id).toBe("4");
    expect(r.skipped).toBe(3);
  });

  it("reports exhausted (with skip count) when EVERY question is incomplete", async () => {
    state.DB = [incomplete("1"), incomplete("2")];
    const r = await pickQuestionForSchedule(schedule());
    expect(r.exhausted).toBe(true);
    expect(r.skipped).toBe(2);
    expect(r.q).toBeUndefined();
  });

  it("does not post a single scheduled question that is incomplete", async () => {
    state.DB = [incomplete("42")];
    const r = await pickQuestionForSchedule({ source: { question: "42" } });
    expect(r.exhausted).toBe(true);
    expect(r.skipped).toBe(1);
  });

  it("posts a single scheduled question when it is complete", async () => {
    state.DB = [complete("42")];
    const r = await pickQuestionForSchedule({ source: { question: "42" } });
    expect(r.q?._id).toBe("42");
  });
});
