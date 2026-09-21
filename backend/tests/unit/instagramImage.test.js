import { describe, it, expect } from "vitest";
import {
  toInstagramSafeUrl,
  toInstagramStoryUrl,
  isInstagramAspectOk,
  IG_MIN_AR,
  IG_MAX_AR,
  STORY_WIDTH,
  STORY_HEIGHT,
} from "../../src/utils/instagramImage.js";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
// The injected chain caps width at 1440 px (Meta rejects oversize images with
// subcode 2207076), forces JPEG (Instagram only accepts JPEG), then pads ONLY
// when too tall (<4:5) or too wide (>1.91) — otherwise the exact card is
// delivered. Each `if_<condition>` is its OWN `/`-separated component; the
// comma-joined form (`if_ar_lt_0.8,c_pad,…`) makes Cloudinary return HTTP 400.
const TRANSFORM =
  "c_limit,w_1440/" +
  "f_jpg,q_auto:good,fl_progressive:none/" +
  "if_ar_lt_0.8/c_pad,ar_4:5,b_white/if_end/" +
  "if_ar_gt_1.91/c_pad,ar_1.91,b_white/if_end";

describe("toInstagramSafeUrl", () => {
  it("injects the JPEG + conditional pad transform into a plain Cloudinary URL", () => {
    const out = toInstagramSafeUrl(`${CLOUD}/v123/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${TRANSFORM}/v123/mystudyguide/social/card.png`);
  });

  it("works when there is no version segment", () => {
    const out = toInstagramSafeUrl(`${CLOUD}/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${TRANSFORM}/mystudyguide/social/card.png`);
  });

  it("always forces JPEG (Instagram rejects PNG as an invalid media type)", () => {
    const out = toInstagramSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("f_jpg");
  });

  it("forces a BASELINE JPEG (Instagram cannot decode progressive JPEGs → subcode 2207052)", () => {
    // Cloudinary's default lossy encoder emits a PROGRESSIVE JPEG, which Meta's
    // image ingest rejects with "Only photo or video can be accepted as media
    // type." even though the URL is public and returns HTTP 200. Baseline is
    // forced with fl_progressive:none; fl_lossy (which produced progressive) is
    // gone.
    const out = toInstagramSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("fl_progressive:none");
    expect(out).not.toContain("fl_lossy");
  });

  it("keeps each if_ condition as its OWN component (never comma-joined)", () => {
    // Regression guard: `if_ar_lt_0.8,c_pad` makes Cloudinary 400 and breaks
    // Instagram fetching. The condition must be followed by `/`, not `,`.
    const out = toInstagramSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("if_ar_lt_0.8/c_pad");
    expect(out).toContain("if_ar_gt_1.91/c_pad");
    expect(out).not.toMatch(/if_ar_lt_0\.8,/);
    expect(out).not.toMatch(/if_ar_gt_1\.91,/);
  });

  it("only pads conditionally — an in-range card is a no-op at delivery", () => {
    // The pad is guarded by if_ar_lt_0.8 / if_ar_gt_1.91, so Cloudinary applies
    // NO padding to a card already within range (exact card delivered as JPEG).
    const out = toInstagramSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("if_ar_lt_0.8");
    expect(out).toContain("if_ar_gt_1.91");
    expect(out).toContain("if_end");
  });

  it("is idempotent — does not stack a second transform", () => {
    const once = toInstagramSafeUrl(`${CLOUD}/v123/card.png`);
    const twice = toInstagramSafeUrl(once);
    expect(twice).toBe(once);
    // Exactly one width cap + format + conditional block.
    expect(twice.match(/c_limit,w_1440/g)).toHaveLength(1);
    expect(twice.match(/f_jpg/g)).toHaveLength(1);
    expect(twice.match(/if_ar_lt_0\.8/g)).toHaveLength(1);
  });

  it("caps the delivered width so Meta never gets an oversize source image", () => {
    // Meta's transcoder intermittently fails with subcode 2207076 or status
    // "Fatal" when the source image is far larger than IG's 1440 px recommendation.
    // c_limit only downscales — a smaller card is unaffected.
    const out = toInstagramSafeUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain("c_limit,w_1440");
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

describe("toInstagramStoryUrl", () => {
  // A Story is a fixed 9:16 full-screen canvas. Without this, the platform fills
  // the canvas with a feed-shaped card and CROPS the left/right edges (the bug
  // seen on the live IG Story). We contain-pad to 1080×1920 so nothing is lost.
  const STORY_PAD =
    `c_limit,w_1440/f_jpg,q_auto:good,fl_progressive:none/c_pad,w_${STORY_WIDTH},h_${STORY_HEIGHT},b_white`;

  it("targets Instagram's recommended 1080×1920 (9:16) story canvas", () => {
    expect(STORY_WIDTH).toBe(1080);
    expect(STORY_HEIGHT).toBe(1920);
    expect(STORY_WIDTH / STORY_HEIGHT).toBeCloseTo(9 / 16, 5);
  });

  it("injects a contain-pad-to-9:16 transform into a plain Cloudinary URL", () => {
    const out = toInstagramStoryUrl(`${CLOUD}/v123/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${STORY_PAD}/v123/mystudyguide/social/card.png`);
  });

  it("works when there is no version segment", () => {
    const out = toInstagramStoryUrl(`${CLOUD}/mystudyguide/social/card.png`);
    expect(out).toBe(`${CLOUD}/${STORY_PAD}/mystudyguide/social/card.png`);
  });

  it("uses c_pad (contain) so the card is never cropped", () => {
    const out = toInstagramStoryUrl(`${CLOUD}/v1/card.png`);
    expect(out).toContain(`c_pad,w_${STORY_WIDTH},h_${STORY_HEIGHT}`);
    // c_pad fills the remainder — must NOT be c_fill/c_crop (which would crop).
    expect(out).not.toContain("c_fill");
    expect(out).not.toContain("c_crop");
  });

  it("forces JPEG for the story image too", () => {
    expect(toInstagramStoryUrl(`${CLOUD}/v1/card.png`)).toContain("f_jpg");
  });

  it("is idempotent — does not stack a second story pad", () => {
    const once = toInstagramStoryUrl(`${CLOUD}/v123/card.png`);
    const twice = toInstagramStoryUrl(once);
    expect(twice).toBe(once);
    expect(twice.match(new RegExp(`c_pad,w_${STORY_WIDTH}`, "g"))).toHaveLength(1);
  });

  it("leaves non-Cloudinary URLs untouched", () => {
    const url = "https://example.com/some/photo.jpg";
    expect(toInstagramStoryUrl(url)).toBe(url);
  });

  it("handles empty / nullish input safely", () => {
    expect(toInstagramStoryUrl("")).toBe("");
    expect(toInstagramStoryUrl(null)).toBe("");
    expect(toInstagramStoryUrl(undefined)).toBe("");
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
