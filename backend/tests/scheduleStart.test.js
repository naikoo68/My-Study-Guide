import { describe, it, expect } from "vitest";
import { dueSlot } from "../src/config/facebook.js";

// Times are Asia/Kolkata (UTC+5:30). ist("2026-09-30 09:48") → that instant.
const ist = (s) => new Date(`${s.replace(" ", "T")}:00+05:30`);
const sch = (o) => ({ mode: "recurring", timezone: "Asia/Kolkata", days: [], lastSlot: "", ...o });

describe("repeating schedule with a start date & time", () => {
  it("the FIRST video is made at the start time today — even when the daily time already passed", () => {
    const s = sch({ times: ["09:00"], startAt: ist("2026-09-30 09:48") });
    expect(dueSlot(s, ist("2026-09-30 09:47"))).toBeNull();
    expect(dueSlot(s, ist("2026-09-30 09:48"))).toBe("start 2026-09-30 09:48");
  });
  it("after the start video, today's earlier daily time doesn't fire again; tomorrow's does", () => {
    const s = sch({ times: ["09:00"], startAt: ist("2026-09-30 09:48"), lastSlot: "start 2026-09-30 09:48" });
    expect(dueSlot(s, ist("2026-09-30 09:49"))).toBeNull();
    expect(dueSlot(s, ist("2026-10-01 09:00"))).toBe("2026-10-01 09:00");
  });
  it("same time as the start (09:50 / 09:50) → one video, not two", () => {
    const s = sch({ times: ["09:50"], startAt: ist("2026-09-30 09:50") });
    const first = dueSlot(s, ist("2026-09-30 09:51"));
    expect(first).toBe("start 2026-09-30 09:50");
    expect(dueSlot({ ...s, lastSlot: first }, ist("2026-09-30 09:52"))).toBeNull();
  });
  it("a daily time LATER on the start day still runs", () => {
    const s = sch({ times: ["09:00", "18:00"], startAt: ist("2026-09-30 09:48"), lastSlot: "start 2026-09-30 09:48" });
    expect(dueSlot(s, ist("2026-09-30 18:00"))).toBe("2026-09-30 18:00");
  });
  it("without a start date nothing changes", () => {
    expect(dueSlot(sch({ times: ["09:00"] }), ist("2026-09-30 09:05"))).toBe("2026-09-30 09:00");
  });
});
