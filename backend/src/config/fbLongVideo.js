// Post a LONG (normal, 16:9) video to the connected Facebook Page — the same
// full quiz video that goes to YouTube. Facebook can't take our local file
// directly with a Page token, so the MP4 is hosted on Cloudinary first and
// Facebook fetches it (file_url), exactly like the existing Reel fallback.
//
// Optional: a scheduled time (Facebook keeps it unpublished and publishes it
// then — must be 10 minutes to 6 months ahead) and a custom thumbnail image.
import { uploadFileToCloudinary, isCloudinaryConfigured } from "./cloudinary.js";
import { resolvePageToken, isFacebookConfigured } from "./facebook.js";

export const FB_MIN_SCHEDULE_MS = 10 * 60 * 1000;
const FB_MAX_SCHEDULE_MS = 180 * 24 * 60 * 60 * 1000;

async function fetchWithTimeout(url, opts = {}, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

// Can a Facebook video be scheduled for `publishAt` right now? Pure (tested).
// → { scheduled: boolean, unix?: number, late?: boolean }
export function fbScheduleFor(publishAt, now = Date.now()) {
  if (!publishAt) return { scheduled: false };
  const t = new Date(publishAt).getTime();
  if (Number.isNaN(t)) return { scheduled: false };
  if (t < now + FB_MIN_SCHEDULE_MS) return { scheduled: false, late: true };
  return { scheduled: true, unix: Math.floor(Math.min(t, now + FB_MAX_SCHEDULE_MS) / 1000) };
}

// → { ok, id?, url?, scheduled?, late?, error? }. Never throws.
//   filePath  — local MP4 (hosted on Cloudinary first), or
//   videoUrl  — an already-hosted MP4
//   thumbnail — optional { image: Buffer, mime }
export async function postLongVideoToFacebookPage({ filePath = "", videoUrl = "", title = "", description = "", publishAt = null, thumbnail = null } = {}, cfg) {
  if (!isFacebookConfigured(cfg)) return { ok: false, error: "Facebook Page is not connected." };
  try {
    let src = String(videoUrl || "").trim();
    if (!src) {
      if (!isCloudinaryConfigured()) return { ok: false, error: "Cloudinary is not configured (needed to hand the video to Facebook)." };
      const hosted = await uploadFileToCloudinary(filePath, { resourceType: "video", folder: "mystudyguide/longvideo" });
      src = hosted.secure_url;
    }
    const pageToken = await resolvePageToken(cfg);
    const sched = fbScheduleFor(publishAt);
    const form = new FormData();
    form.set("access_token", pageToken);
    form.set("file_url", src);
    if (title) form.set("title", String(title).slice(0, 255));
    if (description) form.set("description", String(description).slice(0, 5000));
    if (sched.scheduled) {
      form.set("published", "false");
      form.set("scheduled_publish_time", String(sched.unix));
    }
    if (thumbnail?.image?.length) form.set("thumb", new Blob([thumbnail.image], { type: thumbnail.mime || "image/jpeg" }), "thumbnail.jpg");
    const res = await fetchWithTimeout(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.pageId)}/videos`, { method: "POST", body: form }, 180000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) {
      const m = data?.error?.message || `Facebook video upload failed (${res.status}).`;
      return { ok: false, error: /\(#200\)|publish_actions|pages_manage_posts/i.test(m) ? `Facebook rejected the token — use a Page token with pages_manage_posts. ${m}` : m };
    }
    return {
      ok: true,
      id: String(data.id),
      url: `https://www.facebook.com/${encodeURIComponent(cfg.pageId)}/videos/${encodeURIComponent(data.id)}`,
      scheduled: sched.scheduled,
      late: !!sched.late,
    };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "Facebook upload timed out." : (e?.message || "Could not reach Facebook.") };
  }
}
