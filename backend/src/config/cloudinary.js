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
// that duration + its public id, upload the image, then render an MP4 whose
// visual is the image scaled to fill a 9:16 frame, applied as a layer over the
// audio base for the whole clip — so the image shows for the full track with
// the audio as its soundtrack. The eager transformation runs synchronously
// (eager_async: false) so we return a ready-to-fetch mp4 URL, which is what
// Facebook/Instagram need to publish the Reel.
//
// Returns { url, duration }. Throws on any failure (caller surfaces the error).
export async function composeImageAudioToVideo({
  imageUrl,
  audioUrl,
  width = 1080,
  height = 1920,
  folder = "mystudyguide/social",
} = {}) {
  const img = String(imageUrl || "").trim();
  const aud = String(audioUrl || "").trim();
  if (!img) throw new Error("An image is required to build the Reel.");
  if (!aud) throw new Error("An audio track is required to build the Reel.");

  // 1) Upload the audio as a video asset — this is how we learn its duration.
  const audio = await cloudinary.uploader.upload(aud, { folder, resource_type: "video" });
  // 2) Upload the image (its public id becomes the overlay layer).
  const image = await cloudinary.uploader.upload(img, { folder, resource_type: "image" });
  // Overlay public ids use ':' in place of '/' for assets inside a folder.
  const overlayId = String(image.public_id).replace(/\//g, ":");

  // 3) Render the Reel: overlay the image (scaled to fill the 9:16 frame) onto
  // the audio base for the full duration, delivered as an MP4. Run it eagerly
  // and synchronously so the derived file exists before we hand its URL off.
  const result = await cloudinary.uploader.explicit(audio.public_id, {
    type: "upload",
    resource_type: "video",
    eager_async: false,
    eager: [
      {
        transformation: [
          { overlay: overlayId, width, height, crop: "fill", gravity: "center" },
          { flags: "layer_apply" },
        ],
        format: "mp4",
      },
    ],
  });

  const url = result?.eager?.[0]?.secure_url || result?.eager?.[0]?.url;
  if (!url) throw new Error("Cloudinary did not return a composed video URL.");
  return { url, duration: audio.duration };
}

export default cloudinary;
