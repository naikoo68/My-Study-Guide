import { describe, it, expect } from "vitest";
import {
  toInstagramSafeUrl,
  isInstagramAspectOk,
  IG_MIN_AR,
  IG_MAX_AR,
} from "../../src/utils/instagramImage.js";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
// The conditional transform: pad ONLY when too tall (<4:5) or too wide (>1.91),
// otherwise a no-op so the exact card is delivered.
const COND =
  "if_ar_lt_0.8,c_pad,ar_4:5,b_white/if_end/" +
  "if_ar_gt_1.91,c_pad,ar_1.91,b_white/if_end";

describe("toInstagramSafeUrl", () => {
  it("injects the conditional pad transform into a plain Cloudinary URL", () => {
    const out = toInstagramSafeUrl(`${CLOUD}/v123/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${COND}/v123/mystudyguide/social/card.png`);
  });

  it("works when there is no version segment", () => {
    const out = toInstagramSafeUrl(`${CLOUD}/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${COND}/mystudyguide/social/card.png`);
  });

  it("only pads conditionally — an in-range card is a no-op at delivery", () => {
    // The transform is guarded by if_ar_lt_0.8 / if_ar_gt_1.91, so Cloudinary
    // applies NO padding to a card already within range (exact card delivered).
    const out = toInstagramSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("if_ar_lt_0.8");
    expect(out).toContain("if_ar_gt_1.91");
    expect(out).toContain("if_end");
  });

  it("is idempotent — does not stack a second transform", () => {
    const once = toInstagramSafeUrl(`${CLOUD}/v123/card.png`);
    const twice = toInstagramSafeUrl(once);
    expect(twice).toBe(once);
    // Exactly one conditional block.
    expect(twice.match(/if_ar_lt_0\.8/g)).toHaveLength(1);
  });

  it("leaves non-Cloudinary URLs untouched", () => {
    const url = "https://example.com/some/photo.jpg";
    expect(toInstagramSafeUrl(url)).toBe(url);
  });

  it("handles empty / nullish input safely", () => {
    expect(toInstagramSafeUrl("")).toBe("");
    expect(toInstagramSafeUrl(null)).toBe("");
    expect(toInstagramSafeUrl(undefined)).toBe("");
  });

  it("targets Instagram's documented bounds", () => {
    expect(IG_MIN_AR).toBeCloseTo(0.8, 5); // 4:5
    expect(IG_MAX_AR).toBeCloseTo(1.91, 5); // 1.91:1
  });
});

describe("isInstagramAspectOk", () => {
  it("accepts a square image", () => {
    expect(isInstagramAspectOk(1080, 1080)).toBe(true);
  });

  it("accepts the 4:5 portrait boundary", () => {
    expect(isInstagramAspectOk(1080, 1350)).toBe(true);
  });

  it("accepts a typical (in-range) landscape-ish card", () => {
    // The card in the report: wider than 4:5 but well under 1.91 — must be OK,
    // i.e. it should NOT have been padded into a tall canvas.
    expect(isInstagramAspectOk(1040, 900)).toBe(true);
  });

  it("accepts a 1.91:1 landscape image", () => {
    expect(isInstagramAspectOk(1910, 1000)).toBe(true);
  });

  it("rejects a too-tall portrait card (the real bug)", () => {
    // A tall question card: 1080 wide, 2000 tall -> 0.54, below the 0.8 minimum.
    expect(isInstagramAspectOk(1080, 2000)).toBe(false);
  });

  it("rejects a too-wide banner", () => {
    expect(isInstagramAspectOk(2000, 500)).toBe(false);
  });

  it("rejects invalid dimensions", () => {
    expect(isInstagramAspectOk(0, 100)).toBe(false);
    expect(isInstagramAspectOk(100, 0)).toBe(false);
    expect(isInstagramAspectOk(NaN, 100)).toBe(false);
  });
});
