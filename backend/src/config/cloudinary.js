import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// True only when all three Cloudinary credentials are present.
export function isCloudinaryConfigured() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

// Uploads a base64 / data URI or remote URL to Cloudinary.
// resource_type "auto" lets Cloudinary accept images AND raw files (PDF, docs).
export async function uploadToCloudinary(fileStr, folder = "mystudyguide") {
  const result = await cloudinary.uploader.upload(fileStr, { folder, resource_type: "auto" });
  return { url: result.secure_url, format: result.format, bytes: result.bytes };
}

// Uploads an image (e.g. an SVG data URI) and returns a raster URL. `format`
// forces conversion (e.g. "png") so Facebook/Instagram get a real photo.
export async function uploadImage(fileStr, { folder = "mystudyguide/social", format } = {}) {
  const opts = { folder, resource_type: "image" };
  if (format) opts.format = format;
  const result = await cloudinary.uploader.upload(fileStr, opts);
  return { url: result.secure_url, format: result.format, bytes: result.bytes };
}

// Combine a still IMAGE and an AUDIO track into a single vertical MP4 — i.e. a
// Reel — entirely on Cloudinary (no ffmpeg needed on our host).
//
// How it works: Cloudinary stores audio as a *video* asset (a video without a
// visual stream), so it already carries a duration. We upload the audio to get
// that duration + its public id, upload the image, then render an MP4.
//
// IMPORTANT: an audio-only asset has NO visual canvas, so we must CREATE one or
// the output video is empty/broken (this was the earlier bug). We first pad the
// base to a solid black 9:16 canvas of the target size (c_pad on a resource with
// no frames yields a black frame for the whole duration), then lay the image on
// top (c_fit so the whole card stays visible), then force H.264/AAC in an MP4
// container for maximum Facebook/Instagram compatibility. The eager transform
// runs synchronously (eager_async: false) so we return a ready-to-fetch URL.
//
// `durationSec` trims the Reel to that many seconds (from the start of the
// audio). Reels are short, so this defaults to 30s; when the track is shorter
// than the requested length, Cloudinary just uses whatever audio exists.
//
// Returns { url, duration }. Throws on any failure (caller surfaces the error).
export async function composeImageAudioToVideo({
  imageUrl,
  audioUrl,
  width = 1080,
  height = 1920,
  durationSec = 30,
  folder = "mystudyguide/social",
} = {}) {
  const img = String(imageUrl || "").trim();
  const aud = String(audioUrl || "").trim();
  if (!img) throw new Error("An image is required to build the Reel.");
  if (!aud) throw new Error("An audio track is required to build the Reel.");
  // Clamp the length to a safe Reel range. Instagram's documented minimum is
  // 3 s but its transcoder rejects short still-image-over-audio Reels as
  // "Fatal" much more often than longer ones — a 5 s floor gives every
  // Cloudinary-composed Reel enough real video content for Meta's validator
  // to accept it. Facebook is more lenient and posts fine at any duration.
  const REEL_MIN_SEC = 5;
  const REEL_MAX_SEC = 90;
  const dur = Math.max(REEL_MIN_SEC, Math.min(REEL_MAX_SEC, Math.round(Number(durationSec) || 30)));

  // 1) Upload the audio as a video asset — this is how we learn its duration.
  const audio = await cloudinary.uploader.upload(aud, { folder, resource_type: "video" });
  // 2) Upload the image (its public id becomes the overlay layer).
  const image = await cloudinary.uploader.upload(img, { folder, resource_type: "image" });
  // Overlay public ids use ':' in place of '/' for assets inside a folder.
  const overlayId = String(image.public_id).replace(/\//g, ":");
  // Never ask for more than the track actually has (avoids a trailing freeze),
  // and never fall below the 5 s Reel minimum. When the audio really is
  // shorter than 5 s Cloudinary holds the last sample; the composed video is
  // still 5 s long so Instagram's transcoder has enough content to validate.
  const outDur = audio.duration
    ? Math.max(REEL_MIN_SEC, Math.min(dur, Math.max(REEL_MIN_SEC, Math.ceil(audio.duration))))
    : dur;

  // 3) Render the Reel. Chained transform on the AUDIO base:
  //    a) pad to a black WxH canvas + trim to `outDur` seconds (start_offset 0)
  //    b) overlay the image (c_fit)   → whole card visible, centered
  //    c) fl_layer_apply              → bake the overlay in
  //    d) explicit 30 fps + 5 Mbps H.264 (baseline profile) + AAC at 48 kHz
  //       + a 2 s keyframe interval + `faststart` moov placement.
  //       Instagram Reel ingest is much stricter than Facebook: it requires
  //       a constant frame rate (23-60 fps), a real video bitrate (a still-
  //       image-over-audio render otherwise picks a very low fps/bitrate),
  //       and the moov atom at the START of the file for progressive
  //       playback. `keyframe_interval: 2` guarantees an I-frame every 2 s,
  //       which Meta's transcoder validates against; without it we saw
  //       "Fatal" more often on longer flashcard Reels.
  //    e) h264 / aac / mp4            → a standard, widely-playable Reel file
  // Run eagerly + synchronously so the derived file exists before we return it.
  const result = await cloudinary.uploader.explicit(audio.public_id, {
    type: "upload",
    resource_type: "video",
    eager_async: false,
    eager: [
      {
        transformation: [
          { width, height, crop: "pad", background: "black", start_offset: 0, duration: outDur },
          { overlay: overlayId, width, height, crop: "fit" },
          { flags: "layer_apply" },
          {
            video_codec: "h264:baseline:3.1",
            audio_codec: "aac",
            fps: 30,
            bit_rate: "5m",
            audio_frequency: 48000,
            keyframe_interval: 2,
            flags: "faststart",
          },
        ],
        format: "mp4",
      },
    ],
  });

  // Prefer the eagerly-derived URL Cloudinary just built.
  let url = result?.eager?.[0]?.secure_url || result?.eager?.[0]?.url;
  // If Cloudinary silently promoted the "sync" eager to async (they do this for
  // slow renders — the response then carries `status:"processing"` and NO URL,
  // even though we asked eager_async:false), build the derivation URL ourselves
  // from the same audio public_id + transform we just asked for. Cloudinary
  // finishes the render on the first hit and serves the mp4 from cache after —
  // Meta's fetch waits long enough for that first render on almost every card.
  // This is far better than throwing, which drops the Reel and forces a plain
  // photo fallback (which then also fails on Instagram, see IG "Only photo or
  // video can be accepted as media type." — media_download_error).
  if (!url) {
    try {
      url = cloudinary.url(audio.public_id, {
        resource_type: "video",
        format: "mp4",
        secure: true,
        transformation: [
          { width, height, crop: "pad", background: "black", start_offset: 0, duration: outDur },
          { overlay: overlayId, width, height, crop: "fit" },
          { flags: "layer_apply" },
          {
            video_codec: "h264:baseline:3.1",
            audio_codec: "aac",
            fps: 30,
            bit_rate: "5m",
            audio_frequency: 48000,
            keyframe_interval: 2,
            flags: "faststart",
          },
        ],
      });
    } catch {
      /* fall through — throw below */
    }
  }
  if (!url) throw new Error("Cloudinary did not return a composed video URL.");
  return { url, duration: outDur };
}

// Re-host an already-transformed Cloudinary delivery URL as a NEW, PLAIN stored
// asset — one whose delivery URL carries NO on-the-fly transformation chain
// (just `/upload/v<version>/<folder>/<id>.<ext>`).
//
// WHY: Instagram's media ingestion uses a DIFFERENT server-side fetch path from
// Facebook's (confirmed by Meta/aggregators). That IG path fails to fetch our
// long Cloudinary TRANSFORMATION URLs — it returns subcode 2207052 "The media
// could not be fetched from this URI" — even though the exact URL is public and
// returns HTTP 200/206 to every other client, including Facebook's own
// ingestion path and the `facebookexternalhit` crawler. The same asymmetry
// makes Facebook Reels (which also fetch by file_url) fail to download a
// composed-video transformation URL. Handing Meta a PLAIN, fully-baked stored
// asset removes the transformation from its fetch entirely and sidesteps the
// problem.
//
// HOW: Cloudinary fetches its OWN transform URL internally (fast, same-origin),
// bakes the result into a brand-new stored asset, and returns a plain delivery
// URL for it. For images the stored bytes are the final baseline JPEG (already
// width-capped, aspect-padded); for video the final H.264 MP4.
//
// Best-effort: on ANY failure (or when Cloudinary isn't configured) it returns
// the ORIGINAL url unchanged, so posting is never blocked by the re-host step.
export async function rehostAsPlainAsset(url, { resourceType = "image", folder = "mystudyguide/social/meta" } = {}) {
  const u = String(url || "").trim();
  if (!u) return u;
  if (!isCloudinaryConfigured()) return u;
  try {
    const result = await cloudinary.uploader.upload(u, { folder, resource_type: resourceType });
    return result?.secure_url || result?.url || u;
  } catch {
    return u; // keep the original URL — no worse than before the re-host attempt
  }
}

export default cloudinary;
