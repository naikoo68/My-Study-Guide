import { describe, it, expect } from "vitest";
import {
  toFacebookSafeUrl,
  isFacebookAspectOk,
  FB_MAX_AR,
} from "../../src/utils/facebookImage.js";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
// The injected chain: pad ONLY when the card is WIDER than square (>1:1), onto a
// portrait 4:5 canvas so Facebook's feed shows it in full. A portrait/square
// card is a no-op at delivery (exact card served). NOTE: the `if_` condition is
// its OWN `/`-separated component — the comma-joined form makes Cloudinary 400.
const TRANSFORM = "if_ar_gt_1.0/c_pad,ar_4:5,b_white/if_end";

describe("toFacebookSafeUrl", () => {
  it("injects the conditional pad transform into a plain Cloudinary URL", () => {
    const out = toFacebookSafeUrl(`${CLOUD}/v123/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${TRANSFORM}/v123/mystudyguide/social/card.png`);
  });

  it("works when there is no version segment", () => {
    const out = toFacebookSafeUrl(`${CLOUD}/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${TRANSFORM}/mystudyguide/social/card.png`);
  });

  it("keeps Facebook's PNG (does NOT force a format — unlike Instagram)", () => {
    // Facebook accepts PNG, so we must NOT rewrite the format; only pad.
    const out = toFacebookSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).not.toContain("f_jpg");
  });

  it("keeps the if_ condition as its OWN component (never comma-joined)", () => {
    // Regression guard: `if_ar_gt_1.0,c_pad` makes Cloudinary 400 and Facebook
    // then can't fetch the image. The condition must be followed by `/`.
    const out = toFacebookSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("if_ar_gt_1.0/c_pad");
    expect(out).not.toMatch(/if_ar_gt_1\.0,/);
  });

  it("only pads conditionally — a portrait/square card is a no-op at delivery", () => {
    const out = toFacebookSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("if_ar_gt_1.0");
    expect(out).toContain("if_end");
  });

  it("is idempotent — does not stack a second transform", () => {
    const once = toFacebookSafeUrl(`${CLOUD}/v123/card.png`);
    const twice = toFacebookSafeUrl(once);
    expect(twice).toBe(once);
    expect(twice.match(/if_ar_gt_1\.0/g)).toHaveLength(1);
  });

  it("leaves non-Cloudinary URLs untouched", () => {
    const url = "https://example.com/some/photo.jpg";
    expect(toFacebookSafeUrl(url)).toBe(url);
  });

  it("handles empty / nullish input safely", () => {
    expect(toFacebookSafeUrl("")).toBe("");
    expect(toFacebookSafeUrl(null)).toBe("");
    expect(toFacebookSafeUrl(undefined)).toBe("");
  });

  it("targets the square boundary as the widest fully-shown ratio", () => {
    expect(FB_MAX_AR).toBeCloseTo(1.0, 5);
  });
});

describe("isFacebookAspectOk", () => {
  it("accepts a square image", () => {
    expect(isFacebookAspectOk(1080, 1080)).toBe(true);
  });

  it("accepts a portrait card (statements / matching)", () => {
    expect(isFacebookAspectOk(1080, 1350)).toBe(true);
  });

  it("rejects a wide/short plain-MCQ card (the real bug)", () => {
    // A short MCQ card: ~1040 wide, 700 tall -> 1.49, wider than square.
    expect(isFacebookAspectOk(1040, 700)).toBe(false);
  });

  it("rejects a landscape banner", () => {
    expect(isFacebookAspectOk(1200, 630)).toBe(false);
  });

  it("rejects invalid dimensions", () => {
    expect(isFacebookAspectOk(0, 100)).toBe(false);
    expect(isFacebookAspectOk(100, 0)).toBe(false);
    expect(isFacebookAspectOk(NaN, 100)).toBe(false);
  });
});
