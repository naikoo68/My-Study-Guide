import { describe, it, expect } from "vitest";
import { splitNarrationPauses, hasNarrationPauses, stripNarrationPauses } from "../src/utils/narrationPauses.js";

describe("narration pause marks", () => {
  it("splits text around [pause] (1 s by default) and [pause N]", () => {
    expect(splitNarrationPauses("Thanks for watching! [pause] Subscribe [pause 2.5] and share."))
      .toEqual([{ text: "Thanks for watching!" }, { pause: 1 }, { text: "Subscribe" }, { pause: 2.5 }, { text: "and share." }]);
  });

  it("accepts short forms, any case and spacing", () => {
    expect(splitNarrationPauses("A [p] B [P 2] C [ Pause 0.5 ] D [3s] E")).toEqual([
      { text: "A" }, { pause: 1 }, { text: "B" }, { pause: 2 }, { text: "C" }, { pause: 0.5 }, { text: "D" }, { pause: 3 }, { text: "E" },
    ]);
  });

  it("clamps seconds and merges back-to-back pauses", () => {
    expect(splitNarrationPauses("A [pause 60] B")).toEqual([{ text: "A" }, { pause: 10 }, { text: "B" }]);
    expect(splitNarrationPauses("A [pause] [pause 2] B")).toEqual([{ text: "A" }, { pause: 3 }, { text: "B" }]);
    expect(splitNarrationPauses("[pause 2] Hello")).toEqual([{ pause: 2 }, { text: "Hello" }]);
  });

  it("leaves other brackets alone", () => {
    expect(hasNarrationPauses("Option [A] is right, see [2]")).toBe(false);
    expect(splitNarrationPauses("Option [A] is right")).toEqual([{ text: "Option [A] is right" }]);
    expect(hasNarrationPauses("")).toBe(false);
  });

  it("strips the marks for captions", () => {
    expect(stripNarrationPauses("Thanks! [pause 2] Subscribe [p] now")).toBe("Thanks! Subscribe now");
  });
});
