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

// Upload a raw Buffer (e.g. an MP3 from the TTS API, or an SVG/PNG image, or an
// MP4 video) to Cloudinary and return its hosted asset. Cloudinary's uploader
// accepts a data URI, so we base64-encode the buffer with the right MIME type —
// the same pattern the SVG card renderer already uses.
//
//   resourceType: "image" | "video" | "raw" | "auto". NOTE audio is uploaded as
//                 a "video" resource on Cloudinary (that's how it carries a
//                 duration). `format` optionally forces a delivery format
//                 (e.g. "jpg" to rasterise an SVG, "mp4" for video).
//
// Returns { secure_url, url, public_id, format, bytes, duration } — `duration`
// is present for audio/video assets (seconds), undefined for images.
export async function uploadBufferToCloudinary(
  buffer,
  { resourceType = "auto", folder = "mystudyguide/slideshow", format, mime = "application/octet-stream" } = {}
) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!buf.length) throw new Error("Nothing to upload (empty buffer).");
  const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
  const opts = { folder, resource_type: resourceType };
  if (format) opts.format = format;
  const r = await cloudinary.uploader.upload(dataUri, opts);
  return {
    secure_url: r.secure_url,
    url: r.secure_url,
    public_id: r.public_id,
    format: r.format,
    bytes: r.bytes,
    duration: r.duration, // seconds, for audio/video
  };
}

// Turn a Cloudinary folder public id into the ':' -separated form used inside an
// overlay reference (assets in a folder use ':' in place of '/').
const overlayRef = (publicId) => String(publicId).replace(/\//g, ":");

// Combine MULTIPLE branded slides (each a still image + its own narration audio)
// into ONE vertical MP4 slideshow — entirely on Cloudinary (no ffmpeg on our
// host), mirroring how composeImageAudioToVideo builds a single-image Reel.
//
// HOW IT WORKS (all on Cloudinary):
//   1) For each slide we build a SEGMENT video: the slide's narration audio
//      (already uploaded as a "video" resource, so it has a duration) padded to
//      the target 9:16 canvas with the slide image laid on top (c_fit), trimmed
//      to the narration length (with a small minimum floor so a very short clip
//      still validates). We render it EAGERLY + SYNCHRONOUSLY, then re-host it
//      as a PLAIN stored asset so it has a stable public id to concatenate.
//   2) We CONCATENATE the stored segments in order using Cloudinary's video
//      splice (overlay a video with fl_splice + fl_layer_apply appends it),
//      then force H.264 / AAC in an MP4 container for maximum Meta compatibility.
//
// Each slide's duration is derived from ITS narration length (never a fixed 5s),
// so narration and slide timing stay in sync. Returns
//   { url, duration, slideCount, segments: [{ publicId, duration }] }.
//
// `slides` is an array of:
//   { imagePublicId, audioPublicId, audioDuration, minDurationSec? }
// (image + audio must already be uploaded — the slideshow service does that so
// it can reuse the audio it already fetched from the TTS API).
export async function composeSlideshowVideo({
  slides = [],
  width = 1080,
  height = 1920,
  folder = "mystudyguide/slideshow",
  minDurationSec = 3,
  maxDurationSec = 20,
} = {}) {
  const list = Array.isArray(slides) ? slides.filter((s) => s && s.imagePublicId && s.audioPublicId) : [];
  if (!list.length) throw new Error("No slides to compose.");

  const MIN = Math.max(1, Number(minDurationSec) || 3);
  const MAX = Math.max(MIN, Number(maxDurationSec) || 20);

  // ---- 1) Build each slide segment as a stored MP4 asset --------------------
  const segments = [];
  let total = 0;
  for (const slide of list) {
    // A slide shows for as long as its narration, clamped to a sane range, plus
    // a little tail so the last word isn't clipped.
    const narr = Math.ceil(Number(slide.audioDuration) || 0);
    const segDur = Math.max(MIN, Math.min(MAX, (narr || MIN) + 1));
    const overlayId = overlayRef(slide.imagePublicId);

    const transformation = [
      { width, height, crop: "pad", background: "white", start_offset: 0, duration: segDur },
      { overlay: overlayId, width, height, crop: "fit" },
      { flags: "layer_apply" },
      { video_codec: "h264", audio_codec: "aac" },
    ];

    // Render the segment synchronously so the derived file exists to re-host.
    const explicit = await cloudinary.uploader.explicit(slide.audioPublicId, {
      type: "upload",
      resource_type: "video",
      eager_async: false,
      eager: [{ transformation, format: "mp4" }],
    });
    let segUrl = explicit?.eager?.[0]?.secure_url || explicit?.eager?.[0]?.url;
    if (!segUrl) {
      // Cloudinary promoted the eager to async and returned no URL — build the
      // derivation URL ourselves; the first fetch finishes the render.
      segUrl = cloudinary.url(slide.audioPublicId, {
        resource_type: "video",
        format: "mp4",
        secure: true,
        transformation,
      });
    }
    if (!segUrl) throw new Error("Cloudinary did not return a slide segment URL.");

    // Re-host the segment as a PLAIN stored asset so it has a stable public id
    // (no transformation chain) that can be spliced into the final video.
    const stored = await cloudinary.uploader.upload(segUrl, { folder: `${folder}/segments`, resource_type: "video" });
    const storedId = stored?.public_id;
    if (!storedId) throw new Error("Cloudinary did not store a slide segment.");
    segments.push({ publicId: storedId, duration: segDur });
    total += segDur;
  }

  // A single slide needs no concatenation.
  if (segments.length === 1) {
    const only = cloudinary.url(segments[0].publicId, { resource_type: "video", format: "mp4", secure: true });
    return { url: only, duration: total, slideCount: 1, segments };
  }

  // ---- 2) Concatenate the stored segments (splice) --------------------------
  const [first, ...rest] = segments;
  const concatTransform = [];
  for (const seg of rest) {
    concatTransform.push({ overlay: `video:${overlayRef(seg.publicId)}`, flags: "splice" });
    concatTransform.push({ flags: "layer_apply" });
  }
  concatTransform.push({ video_codec: "h264", audio_codec: "aac" });

  const finalExplicit = await cloudinary.uploader.explicit(first.publicId, {
    type: "upload",
    resource_type: "video",
    eager_async: false,
    eager: [{ transformation: concatTransform, format: "mp4" }],
  });
  let url = finalExplicit?.eager?.[0]?.secure_url || finalExplicit?.eager?.[0]?.url;
  if (!url) {
    url = cloudinary.url(first.publicId, {
      resource_type: "video",
      format: "mp4",
      secure: true,
      transformation: concatTransform,
    });
  }
  if (!url) throw new Error("Cloudinary did not return the composed slideshow URL.");

  // Bake the concatenation into a PLAIN stored asset so Meta can fetch it (same
  // reason as rehostAsPlainAsset for single-image Reels).
  const plain = await rehostAsPlainAsset(url, { resourceType: "video", folder: `${folder}/final` });
  return { url: plain || url, duration: total, slideCount: segments.length, segments };
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
  // Clamp the length to a sane Reel range. Instagram's documented minimum is
  // 3 s; keep a light 3 s floor (their real tracks are ~30 s, so this rarely
  // matters) and Facebook's ~90 s cap. NOTE: we intentionally keep the ENCODE
  // simple — the heavier settings we tried (explicit 5 Mbps bitrate, baseline
  // profile, keyframe interval, faststart, a 5 s floor) made Cloudinary take
  // much longer to BUILD the video, so it often wasn't ready when Meta came to
  // download it → "Unable to fetch video file from URL." A simple, fast encode
  // is what worked when the feature was first added.
  const REEL_MIN_SEC = 3;
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
  //    d) h264 / aac / mp4            → a standard, widely-playable Reel file.
  //       Keep this SIMPLE (just the codec, no explicit bitrate/fps/keyframe/
  //       faststart). This is the encode that worked when Reels were first
  //       added; a light encode builds fast on Cloudinary, so the file is ready
  //       when Meta downloads it. Delivery reliability is handled downstream
  //       (config/facebook.js warms the render, then re-hosts it as a plain
  //       asset Meta can fetch, and falls back to an image if all else fails).
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
          { video_codec: "h264", audio_codec: "aac" },
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
          { video_codec: "h264", audio_codec: "aac" },
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
