import { describe, it, expect } from "vitest";
import { pickScheduleFields, validateScheduleData } from "../../src/controllers/facebookController.js";

// Helper: build sanitized data then validate in one step.
const check = (body) => validateScheduleData(pickScheduleFields(body));

describe("pickScheduleFields", () => {
  it("defaults kind to 'question' and mode to 'recurring'", () => {
    const d = pickScheduleFields({});
    expect(d.kind).toBe("question");
    expect(d.mode).toBe("recurring");
    expect(d.runAt).toBeNull();
  });

  it("accepts kind 'custom' with text and keeps only valid http(s) media URLs", () => {
    const d = pickScheduleFields({
      kind: "custom",
      customText: "  Hello world  ",
      customMedia: ["https://res.cloudinary.com/x/a.png", "javascript:alert(1)", "", "http://ok.com/b.jpg"],
    });
    expect(d.kind).toBe("custom");
    expect(d.customText).toBe("Hello world");
    expect(d.customMedia).toEqual(["https://res.cloudinary.com/x/a.png", "http://ok.com/b.jpg"]);
  });

  it("caps custom media at 10 items", () => {
    const many = Array.from({ length: 15 }, (_, i) => `https://c.com/${i}.png`);
    expect(pickScheduleFields({ kind: "custom", customMedia: many }).customMedia).toHaveLength(10);
  });

  it("parses a one-off runAt only when mode is 'once'", () => {
    const iso = "2030-01-01T09:00:00.000Z";
    expect(pickScheduleFields({ mode: "once", runAt: iso }).runAt.toISOString()).toBe(iso);
    // runAt ignored for recurring
    expect(pickScheduleFields({ mode: "recurring", runAt: iso }).runAt).toBeNull();
    // invalid runAt → null
    expect(pickScheduleFields({ mode: "once", runAt: "not-a-date" }).runAt).toBeNull();
  });

  it("keeps only HH:MM-shaped times (max 20)", () => {
    // Note: this mirrors the controller's format-only check (\d{1,2}:\d{2}) —
    // it filters malformed entries, not out-of-range clock values.
    const d = pickScheduleFields({ times: ["09:00", "bad", "9:5", "18:30"] });
    expect(d.times).toEqual(["09:00", "18:30"]);
  });
});

describe("validateScheduleData — question schedules", () => {
  it("requires a source", () => {
    expect(check({ kind: "question", times: ["09:00"] }))
      .toMatch(/pick a source/i);
  });

  it("passes with a source and a time", () => {
    expect(check({ kind: "question", source: { quiz: "abc" }, times: ["09:00"] })).toBe("");
  });

  it("requires at least one time when recurring", () => {
    expect(check({ kind: "question", source: { subject: "s1" }, times: [] }))
      .toMatch(/at least one time/i);
  });
});

describe("validateScheduleData — custom schedules", () => {
  it("requires text or media", () => {
    expect(check({ kind: "custom", times: ["09:00"] }))
      .toMatch(/text or.*media/i);
  });

  it("passes with text only", () => {
    expect(check({ kind: "custom", customText: "Announcement", times: ["09:00"] })).toBe("");
  });

  it("passes with media only (no text)", () => {
    expect(check({ kind: "custom", customMedia: ["https://c.com/a.png"], times: ["09:00"] })).toBe("");
  });

  it("does NOT require a question source", () => {
    // A custom post has no source; validation must not complain about it.
    const err = check({ kind: "custom", customText: "hi", times: ["09:00"] });
    expect(err).not.toMatch(/source/i);
  });

  it("requires runAt for a one-off custom post", () => {
    expect(check({ kind: "custom", customText: "hi", mode: "once" }))
      .toMatch(/date & time/i);
  });

  it("passes a one-off custom post with a valid runAt", () => {
    expect(check({ kind: "custom", customText: "hi", mode: "once", runAt: "2030-05-01T10:00:00Z" })).toBe("");
  });
});
