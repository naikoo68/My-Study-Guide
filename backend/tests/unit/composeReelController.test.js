import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// composeReel controller (POST /api/facebook/compose-reel). We mock the
// Cloudinary config module so no real media work happens, and assert the
// validation (required fields + SSRF guard) and the success/error responses.
// ─────────────────────────────────────────────────────────────────────────

const composeImageAudioToVideo = vi.fn();
const isCloudinaryConfigured = vi.fn(() => true);

vi.mock("../../src/config/cloudinary.js", () => ({
  composeImageAudioToVideo,
  isCloudinaryConfigured,
  // Other exports used by transitively-imported modules (cardShot/socialImage).
  uploadImage: vi.fn(),
  uploadToCloudinary: vi.fn(),
  default: {},
}));

const { composeReel } = await import("../../src/controllers/facebookController.js");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

beforeEach(() => {
  composeImageAudioToVideo.mockReset();
  isCloudinaryConfigured.mockReturnValue(true);
});

describe("composeReel controller", () => {
  it("returns the composed video URL on success", async () => {
    composeImageAudioToVideo.mockResolvedValue({ url: "https://cdn/reel.mp4", duration: 30 });
    const res = mockRes();
    await composeReel({ body: { imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: "https://cdn/reel.mp4", duration: 30 });
    expect(composeImageAudioToVideo).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3" }));
  });

  it("400s when the image or audio is missing", async () => {
    const res = mockRes();
    await composeReel({ body: { imageUrl: "https://cdn/x.png" } }, res);
    expect(res.statusCode).toBe(400);
    expect(composeImageAudioToVideo).not.toHaveBeenCalled();
  });

  it("400s (SSRF guard) when a URL points at an internal/metadata address", async () => {
    const res = mockRes();
    await composeReel({ body: { imageUrl: "http://169.254.169.254/latest/meta-data", audioUrl: "https://cdn/a.mp3" } }, res);
    expect(res.statusCode).toBe(400);
    expect(composeImageAudioToVideo).not.toHaveBeenCalled();
  });

  it("503s when Cloudinary is not configured", async () => {
    isCloudinaryConfigured.mockReturnValue(false);
    const res = mockRes();
    await composeReel({ body: { imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3" } }, res);
    expect(res.statusCode).toBe(503);
    expect(composeImageAudioToVideo).not.toHaveBeenCalled();
  });

  it("502s when the compose step fails", async () => {
    composeImageAudioToVideo.mockRejectedValue(new Error("Cloudinary boom"));
    const res = mockRes();
    await composeReel({ body: { imageUrl: "https://cdn/x.png", audioUrl: "https://cdn/a.mp3" } }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.message).toMatch(/boom/i);
  });
});
