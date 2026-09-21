import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// composeImageAudioToVideo — mixes a still image + an audio track into a
// vertical MP4 (a Reel) using Cloudinary. The Cloudinary SDK is mocked so no
// network/credentials are needed; we assert the upload calls and the eager
// transform that renders the mp4.
// ─────────────────────────────────────────────────────────────────────────

const upload = vi.fn();
const explicit = vi.fn();
const url = vi.fn();

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload, explicit },
    utils: { api_sign_request: vi.fn() },
    url,
  },
}));

const { composeImageAudioToVideo, rehostAsPlainAsset } = await import("../../src/config/cloudinary.js");

beforeEach(() => {
  upload.mockReset();
  explicit.mockReset();
  url.mockReset();
});

describe("composeImageAudioToVideo", () => {
  it("uploads audio as a video asset + the image, then renders a 9:16 mp4 via a synchronous eager transform", async () => {
    upload.mockImplementation(async (file, opts) => {
      if (opts.resource_type === "video") return { public_id: "mystudyguide/social/aud123", duration: 42 };
      return { public_id: "mystudyguide/social/img456" };
    });
    explicit.mockResolvedValue({ eager: [{ secure_url: "https://res.cloudinary.com/x/video/upload/reel.mp4" }] });

    const r = await composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3" });

    expect(r.url).toBe("https://res.cloudinary.com/x/video/upload/reel.mp4");
    // Default Reel length is 30s (the 42s track is trimmed down to it).
    expect(r.duration).toBe(30);

    // Audio uploaded as a VIDEO asset (that's how Cloudinary stores audio); image as an IMAGE.
    expect(upload).toHaveBeenCalledWith("https://cdn/a.mp3", expect.objectContaining({ resource_type: "video" }));
    expect(upload).toHaveBeenCalledWith("https://cdn/x.png", expect.objectContaining({ resource_type: "image" }));

    // Rendered off the AUDIO public id, synchronously, as mp4, with the image
    // overlaid across the frame (folder '/' becomes ':' in the overlay id).
    const [pid, opts] = explicit.mock.calls[0];
    expect(pid).toBe("mystudyguide/social/aud123");
    expect(opts.resource_type).toBe("video");
    expect(opts.eager_async).toBe(false);
    const eager = opts.eager[0];
    expect(eager.format).toBe("mp4");
    const tx = eager.transformation;
    // 1) a black 9:16 canvas on the audio base (fixes broken video), trimmed to 30s
    expect(tx[0]).toMatchObject({ width: 1080, height: 1920, crop: "pad", background: "black", start_offset: 0, duration: 30 });
    // 2) the image is laid on top (fit, folder '/' → ':') then applied as a layer
    expect(tx[1]).toMatchObject({ overlay: "mystudyguide:social:img456", width: 1080, height: 1920, crop: "fit" });
    expect(tx[2].flags).toBe("layer_apply");
    // 3) a SIMPLE, fast H.264 / AAC encode. We deliberately do NOT set an
    //    explicit bitrate / fps / keyframe interval / faststart: those made
    //    Cloudinary take much longer to BUILD the video, so it wasn't ready
    //    when Meta came to download it ("Unable to fetch video file from URL").
    //    A light encode builds fast; delivery reliability is handled downstream
    //    (warm + re-host as a plain asset + image fallback in facebook.js).
    expect(tx[3]).toEqual({ video_codec: "h264", audio_codec: "aac" });
  });

  it("honours a requested duration, clamps it to ≤90s, and never exceeds the track length", async () => {
    upload.mockImplementation(async (file, opts) => {
      if (opts.resource_type === "video") return { public_id: "aud", duration: 200 };
      return { public_id: "img" };
    });
    explicit.mockResolvedValue({ eager: [{ secure_url: "https://cdn/out.mp4" }] });

    // Requested 30s, long track → exactly 30s.
    let r = await composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3", durationSec: 30 });
    expect(r.duration).toBe(30);
    expect(explicit.mock.calls.at(-1)[1].eager[0].transformation[0].duration).toBe(30);

    // Requested 500s → clamped to the 90s Reel cap.
    r = await composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3", durationSec: 500 });
    expect(r.duration).toBe(90);

    // Track shorter than the request → capped to the track length.
    upload.mockImplementation(async (file, opts) => {
      if (opts.resource_type === "video") return { public_id: "aud", duration: 8 };
      return { public_id: "img" };
    });
    r = await composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3", durationSec: 15 });
    expect(r.duration).toBe(8);
  });

  it("enforces Instagram's 3-second Reel minimum for very short audio tracks", async () => {
    // Instagram rejects Reels under 3 s. We keep a light 3 s floor (their real
    // tracks are ~30 s, so this rarely matters) — the composer bumps a 1-2 s
    // track up to 3 s (Cloudinary holds the last audio sample).
    upload.mockImplementation(async (file, opts) => {
      if (opts.resource_type === "video") return { public_id: "aud", duration: 1 };
      return { public_id: "img" };
    });
    explicit.mockResolvedValue({ eager: [{ secure_url: "https://cdn/out.mp4" }] });

    let r = await composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3", durationSec: 1 });
    expect(r.duration).toBe(3);
    expect(explicit.mock.calls.at(-1)[1].eager[0].transformation[0].duration).toBe(3);

    r = await composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3", durationSec: 2 });
    expect(r.duration).toBe(3);
    expect(explicit.mock.calls.at(-1)[1].eager[0].transformation[0].duration).toBe(3);
  });

  it("errors before any upload when the image or audio URL is missing", async () => {
    await expect(composeImageAudioToVideo({ imageUrl: "", audioUrl: "https://cdn/a.mp3" })).rejects.toThrow(/image/i);
    await expect(composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "" })).rejects.toThrow(/audio/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("throws a clear error when Cloudinary returns no composed URL AND the URL builder also has nothing", async () => {
    upload.mockResolvedValue({ public_id: "p", duration: 5 });
    explicit.mockResolvedValue({ eager: [] });
    // cloudinary.url returns undefined → no fallback URL available either.
    url.mockReturnValue(undefined);
    await expect(
      composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3" }),
    ).rejects.toThrow(/did not return/i);
  });

  it("falls back to a manually-built URL when Cloudinary's eager response has no secure_url", async () => {
    // Cloudinary silently promotes a slow "sync" eager to async: the response
    // then carries { status: "processing" } and NO URL, even though we asked
    // eager_async:false. Previously we threw here and the schedule fell back
    // to posting an image (which then failed on Instagram — see subcode 2207052
    // "Only photo or video can be accepted as media type."). We now build the
    // derivation URL ourselves so Cloudinary can render it on Meta's first hit.
    upload.mockImplementation(async (file, opts) => {
      if (opts.resource_type === "video") return { public_id: "aud", duration: 30 };
      return { public_id: "img" };
    });
    // eager entry has NO secure_url / url — mimics the "processing" pattern.
    explicit.mockResolvedValue({ eager: [{ status: "processing" }] });
    url.mockReturnValue("https://res.cloudinary.com/x/video/upload/aud.mp4");

    const r = await composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3" });

    expect(r.url).toBe("https://res.cloudinary.com/x/video/upload/aud.mp4");
    expect(r.duration).toBe(30);

    // The builder was asked for a video derivation of the AUDIO public id,
    // with the same transformation we passed to explicit(). That URL, when
    // fetched, triggers Cloudinary's on-demand render.
    expect(url).toHaveBeenCalledWith("aud", expect.objectContaining({
      resource_type: "video",
      format: "mp4",
      secure: true,
      transformation: expect.any(Array),
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// rehostAsPlainAsset — re-uploads an already-transformed Cloudinary URL as a
// NEW plain stored asset so Instagram (whose fetch path fails on our long
// transformation URLs with subcode 2207052) gets a clean, baked URL.
// ─────────────────────────────────────────────────────────────────────────
describe("rehostAsPlainAsset", () => {
  const TRANSFORM_URL =
    "https://res.cloudinary.com/x/image/upload/c_limit,w_1440/f_jpg,q_auto:good,fl_progressive:none/if_ar_lt_0.8/c_pad,ar_4:5,b_white/if_end/v1/mystudyguide/social/card.jpg";

  it("returns the original URL untouched when Cloudinary is not configured (best-effort no-op)", async () => {
    // No CLOUDINARY_* env in the test runner → never blocks a post.
    const out = await rehostAsPlainAsset(TRANSFORM_URL);
    expect(out).toBe(TRANSFORM_URL);
    expect(upload).not.toHaveBeenCalled();
  });

  it("re-uploads the transformed URL and returns the new PLAIN secure_url when configured", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "x");
    vi.stubEnv("CLOUDINARY_API_KEY", "k");
    vi.stubEnv("CLOUDINARY_API_SECRET", "s");
    upload.mockResolvedValue({ secure_url: "https://res.cloudinary.com/x/image/upload/v2/mystudyguide/social/meta/plain.jpg" });

    const out = await rehostAsPlainAsset(TRANSFORM_URL, { resourceType: "image" });

    // Meta now receives a plain, transform-free stored asset URL.
    expect(out).toBe("https://res.cloudinary.com/x/image/upload/v2/mystudyguide/social/meta/plain.jpg");
    // Cloudinary fetched the ORIGINAL transform URL and stored the baked result.
    expect(upload).toHaveBeenCalledWith(TRANSFORM_URL, expect.objectContaining({ resource_type: "image" }));
    vi.unstubAllEnvs();
  });

  it("falls back to the original URL if the re-upload throws (never blocks posting)", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "x");
    vi.stubEnv("CLOUDINARY_API_KEY", "k");
    vi.stubEnv("CLOUDINARY_API_SECRET", "s");
    upload.mockRejectedValue(new Error("cloudinary upload failed"));

    const out = await rehostAsPlainAsset(TRANSFORM_URL);
    expect(out).toBe(TRANSFORM_URL);
    vi.unstubAllEnvs();
  });

  it("handles empty input safely", async () => {
    expect(await rehostAsPlainAsset("")).toBe("");
    expect(await rehostAsPlainAsset(null)).toBe("");
  });
});
