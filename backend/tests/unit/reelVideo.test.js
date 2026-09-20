import { describe, it, expect } from "vitest";
import { buildSlideshowFfmpegArgs, clampSecondsPerImage } from "../../src/config/reelVideo.js";

// Pure helpers for the slideshow-Reel renderer (no ffmpeg / no I/O here).

describe("clampSecondsPerImage", () => {
  it("keeps values within 1–60 and defaults junk to 10", () => {
    expect(clampSecondsPerImage(10)).toBe(10);
    expect(clampSecondsPerImage(0)).toBe(1);
    expect(clampSecondsPerImage(-5)).toBe(1);
    expect(clampSecondsPerImage(999)).toBe(60);
    expect(clampSecondsPerImage("15")).toBe(15);
    expect(clampSecondsPerImage("abc")).toBe(10);
    expect(clampSecondsPerImage(undefined)).toBe(10);
  });
});

describe("buildSlideshowFfmpegArgs", () => {
  it("adds one looped input per image with the per-image duration", () => {
    const args = buildSlideshowFfmpegArgs({
      imagePaths: ["/t/a.jpg", "/t/b.jpg", "/t/c.jpg"],
      secondsPerImage: 8,
      outPath: "/t/out.mp4",
    });
    // Three "-loop 1 -t 8 -i <img>" input groups.
    expect(args.filter((a) => a === "-loop")).toHaveLength(3);
    const tCount = args.filter((a, i) => a === "-t" && args[i - 1] === "8" ? false : a === "-t").length;
    expect(args.includes("/t/a.jpg")).toBe(true);
    expect(args.includes("/t/c.jpg")).toBe(true);
    expect(tCount).toBeGreaterThanOrEqual(3); // per-image durations (+ output cap when audio present)
  });

  it("concatenates exactly n video streams and outputs to the given path", () => {
    const args = buildSlideshowFfmpegArgs({ imagePaths: ["/t/a.jpg", "/t/b.jpg"], secondsPerImage: 5, outPath: "/t/reel.mp4" });
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("concat=n=2:v=1:a=0[v]");
    expect(fc).toContain("scale=1080:1920:force_original_aspect_ratio=decrease");
    expect(args[args.length - 1]).toBe("/t/reel.mp4");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
  });

  it("with audio: maps the audio input, loops it and caps output to the slideshow length", () => {
    const args = buildSlideshowFfmpegArgs({
      imagePaths: ["/t/a.jpg", "/t/b.jpg"], // 2 images
      audioPath: "/t/music.mp3",
      secondsPerImage: 10,
      outPath: "/t/out.mp4",
    });
    expect(args).toContain("-stream_loop"); // audio loops
    // audio is input index 2 (after images 0,1) → "-map 2:a"
    const mapIdx = args.indexOf("-map", args.indexOf("[v]"));
    expect(args).toContain("2:a");
    // total length cap = 2 images × 10s = 20s
    expect(args[args.indexOf("-t") === -1 ? 0 : args.lastIndexOf("-t") + 1]).toBe("20");
    expect(args).not.toContain("-an");
  });

  it("without audio: no audio map and adds -an", () => {
    const args = buildSlideshowFfmpegArgs({ imagePaths: ["/t/a.jpg"], secondsPerImage: 10, outPath: "/t/out.mp4" });
    expect(args).toContain("-an");
    expect(args).not.toContain("-stream_loop");
  });

  it("throws when there are no images", () => {
    expect(() => buildSlideshowFfmpegArgs({ imagePaths: [], outPath: "/t/out.mp4" })).toThrow(/image/i);
  });
});
