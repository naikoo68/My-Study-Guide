import { describe, it, expect } from "vitest";
import {
  toFacebookSafeUrl,
  isFacebookAspectOk,
  FB_MAX_AR,
} from "../../src/utils/facebookImage.js";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
// The injected chain: pad ONLY when the card is WIDER than 1.91:1, down to a
// 1.91:1 canvas (a tiny white sliver) so Facebook shows it in full. Any card
// already within range is a no-op at delivery (exact card served). NOTE: the
// `if_` condition is its OWN `/`-separated component — the comma-joined form
// makes Cloudinary 400.
const TRANSFORM = "if_ar_gt_1.91/c_pad,ar_1.91,b_white/if_end";

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

  it("only pads WIDE cards — never adds a tall portrait canvas / big bars", () => {
    // Regression guard for the bad first attempt (padded to 4:5, which stuffed
    // short cards into a tall canvas with huge white margins).
    const out = toFacebookSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("ar_1.91");
    expect(out).not.toContain("ar_4:5");
    expect(out).not.toContain("ar_1:1");
  });

  it("keeps the if_ condition as its OWN component (never comma-joined)", () => {
    // Regression guard: `if_ar_gt_1.91,c_pad` makes Cloudinary 400 and Facebook
    // then can't fetch the image. The condition must be followed by `/`.
    const out = toFacebookSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("if_ar_gt_1.91/c_pad");
    expect(out).not.toMatch(/if_ar_gt_1\.91,/);
  });

  it("only pads conditionally — an in-range card is a no-op at delivery", () => {
    const out = toFacebookSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("if_ar_gt_1.91");
    expect(out).toContain("if_end");
  });

  it("is idempotent — does not stack a second transform", () => {
    const once = toFacebookSafeUrl(`${CLOUD}/v123/card.png`);
    const twice = toFacebookSafeUrl(once);
    expect(twice).toBe(once);
    expect(twice.match(/if_ar_gt_1\.91/g)).toHaveLength(1);
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

  it("targets Facebook's widest supported ratio (1.91:1)", () => {
    expect(FB_MAX_AR).toBeCloseTo(1.91, 5);
  });
});

describe("isFacebookAspectOk", () => {
  it("accepts a square image", () => {
    expect(isFacebookAspectOk(1080, 1080)).toBe(true);
  });

  it("accepts a portrait card (statements / matching)", () => {
    expect(isFacebookAspectOk(1080, 1350)).toBe(true);
  });

  it("accepts a normal landscape-ish MCQ card (in range — NOT padded)", () => {
    // A card that is landscape but within 1.91:1 must be delivered untouched
    // (no white bars added).
    expect(isFacebookAspectOk(1040, 700)).toBe(true); // 1.49:1
  });

  it("accepts the 1.91:1 boundary", () => {
    expect(isFacebookAspectOk(1910, 1000)).toBe(true);
  });

  it("rejects an ultra-wide/short card (the real bug — wider than 1.91:1)", () => {
    expect(isFacebookAspectOk(1040, 430)).toBe(false); // ~2.42:1
  });

  it("rejects invalid dimensions", () => {
    expect(isFacebookAspectOk(0, 100)).toBe(false);
    expect(isFacebookAspectOk(100, 0)).toBe(false);
    expect(isFacebookAspectOk(NaN, 100)).toBe(false);
  });
});
