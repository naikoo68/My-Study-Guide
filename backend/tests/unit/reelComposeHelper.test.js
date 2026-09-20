import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// composeImageAudioToVideo — mixes a still image + an audio track into a
// vertical MP4 (a Reel) using Cloudinary. The Cloudinary SDK is mocked so no
// network/credentials are needed; we assert the upload calls and the eager
// transform that renders the mp4.
// ─────────────────────────────────────────────────────────────────────────

const upload = vi.fn();
const explicit = vi.fn();

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload, explicit },
    utils: { api_sign_request: vi.fn() },
  },
}));

const { composeImageAudioToVideo } = await import("../../src/config/cloudinary.js");

beforeEach(() => {
  upload.mockReset();
  explicit.mockReset();
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
    expect(r.duration).toBe(42);

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
    expect(eager.transformation[0].overlay).toBe("mystudyguide:social:img456");
    expect(eager.transformation[0].width).toBe(1080);
    expect(eager.transformation[0].height).toBe(1920);
    expect(eager.transformation[1].flags).toBe("layer_apply");
  });

  it("errors before any upload when the image or audio URL is missing", async () => {
    await expect(composeImageAudioToVideo({ imageUrl: "", audioUrl: "https://cdn/a.mp3" })).rejects.toThrow(/image/i);
    await expect(composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "" })).rejects.toThrow(/audio/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("throws a clear error when Cloudinary returns no composed URL", async () => {
    upload.mockResolvedValue({ public_id: "p", duration: 5 });
    explicit.mockResolvedValue({ eager: [] });
    await expect(
      composeImageAudioToVideo({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3" }),
    ).rejects.toThrow(/did not return/i);
  });
});
