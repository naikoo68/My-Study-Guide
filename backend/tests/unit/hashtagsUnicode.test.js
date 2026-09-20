import { describe, it, expect } from "vitest";
import { hashtagsForQuestion } from "../../src/config/facebook.js";

// Regression: non-English hashtags (Hindi/Urdu/etc.) were stripped to nothing
// by an ASCII-only normaliser, so only "half" the tags survived. They must now
// be preserved. Passing q=null avoids any DB lookups (pure tag handling).

describe("hashtagsForQuestion — Unicode tags", () => {
  it("keeps non-English hashtags instead of dropping them", async () => {
    const out = await hashtagsForQuestion(null, {}, "#हिन्दी #GK #اردو");
    expect(out).toContain("#हिन्दी");
    expect(out).toContain("#GK");
    expect(out).toContain("#اردو");
  });

  it("normalises separators and strips only punctuation", async () => {
    const out = await hashtagsForQuestion(null, {}, "GK, #JKSSB   #current-affairs");
    // Adds a leading # and removes the hyphen, but keeps the words.
    expect(out).toContain("#GK");
    expect(out).toContain("#JKSSB");
    expect(out).toContain("#currentaffairs");
  });

  it("merges per-post tags with the site default tags (deduped)", async () => {
    const out = await hashtagsForQuestion(null, { fbDefaultHashtags: "#GK #StudyGuide" }, "#GK #Quiz");
    const tags = out.split(" ");
    expect(tags.filter((t) => t.toLowerCase() === "#gk")).toHaveLength(1); // deduped
    expect(out).toContain("#Quiz");
    expect(out).toContain("#StudyGuide");
  });
});
