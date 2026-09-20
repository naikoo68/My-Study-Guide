import { describe, it, expect } from "vitest";
import { resolveReelAudios, nextReelAudio } from "../../src/config/facebook.js";

// ─────────────────────────────────────────────────────────────────────────
// Rotating Reel music library: a schedule cycles through its tracks — one per
// Reel — wrapping back to the first once every track has been used.
// ─────────────────────────────────────────────────────────────────────────

describe("resolveReelAudios", () => {
  it("uses the schedule's own customAudios when present (override, trimmed)", () => {
    expect(resolveReelAudios({ customAudios: [" a.mp3 ", "", "b.mp3"] }, { fbReelAudios: ["g.mp3"] }))
      .toEqual(["a.mp3", "b.mp3"]);
  });
  it("falls back to the legacy single customAudio", () => {
    expect(resolveReelAudios({ customAudio: "solo.mp3" }, {})).toEqual(["solo.mp3"]);
  });
  it("falls back to the SHARED site library when the schedule has no own tracks", () => {
    expect(resolveReelAudios({}, { fbReelAudios: [" x.mp3 ", "", "y.mp3"] })).toEqual(["x.mp3", "y.mp3"]);
    expect(resolveReelAudios({ customAudios: [] }, { fbReelAudios: ["x.mp3"] })).toEqual(["x.mp3"]);
  });
  it("returns [] when there is no audio anywhere", () => {
    expect(resolveReelAudios({}, {})).toEqual([]);
    expect(resolveReelAudios({ customAudios: [] }, { fbReelAudios: [] })).toEqual([]);
    expect(resolveReelAudios({})).toEqual([]);
  });
});

describe("nextReelAudio", () => {
  it("cycles through every track then starts over", () => {
    const lib = ["a", "b", "c"];
    // Simulate 5 scheduled runs starting at index 0.
    let index = 0;
    const played = [];
    for (let run = 0; run < 5; run++) {
      const { audio, nextIndex } = nextReelAudio(lib, index);
      played.push(audio);
      index = nextIndex;
    }
    // a, b, c, then back to a, b — all tracks used before repeating.
    expect(played).toEqual(["a", "b", "c", "a", "b"]);
  });

  it("safely wraps a stale/out-of-range or negative index", () => {
    const lib = ["a", "b", "c"];
    expect(nextReelAudio(lib, 7).audio).toBe("b"); // 7 % 3 = 1
    expect(nextReelAudio(lib, -1).index).toBe(2);   // wraps to the last
    expect(nextReelAudio(lib, undefined).audio).toBe("a");
  });

  it("returns an empty pick for an empty library", () => {
    expect(nextReelAudio([], 3)).toEqual({ audio: "", index: 0, nextIndex: 0 });
  });
});
