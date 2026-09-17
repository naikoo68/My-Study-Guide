import { describe, it, expect } from "vitest";
import {
  toInstagramSafeUrl,
  isInstagramAspectOk,
  IG_TARGET_WIDTH,
  IG_TARGET_HEIGHT,
} from "../../src/utils/instagramImage.js";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
const PAD = `c_pad,w_${IG_TARGET_WIDTH},h_${IG_TARGET_HEIGHT},b_white,fl_lossy,q_auto`;

describe("toInstagramSafeUrl", () => {
  it("injects a 4:5 pad transform into a plain Cloudinary URL", () => {
    const out = toInstagramSafeUrl(`${CLOUD}/v123/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${PAD}/v123/mystudyguide/social/card.png`);
  });

  it("pads even when there is no version segment", () => {
    const out = toInstagramSafeUrl(`${CLOUD}/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${PAD}/mystudyguide/social/card.png`);
  });

  it("does NOT double-pad a URL that already has a transform", () => {
    const already = `${CLOUD}/${PAD}/v123/card.png`;
    const out = toInstagramSafeUrl(already);
    // The old transform segment is replaced, not stacked on top.
    expect(out).toBe(already);
    expect(out.match(/c_pad/g)).toHaveLength(1);
  });

  it("replaces a pre-existing (different) transform segment", () => {
    const out = toInstagramSafeUrl(`${CLOUD}/w_500,h_500,c_fill/v9/card.png`);
    expect(out).toBe(`${CLOUD}/${PAD}/v9/card.png`);
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

  it("targets Instagram's 4:5 minimum ratio", () => {
    expect(IG_TARGET_WIDTH / IG_TARGET_HEIGHT).toBeCloseTo(0.8, 5);
  });
});

describe("isInstagramAspectOk", () => {
  it("accepts a square image", () => {
    expect(isInstagramAspectOk(1080, 1080)).toBe(true);
  });

  it("accepts the 4:5 portrait boundary", () => {
    expect(isInstagramAspectOk(1080, 1350)).toBe(true);
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
