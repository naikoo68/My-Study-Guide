// Server-side Text-to-Speech (TTS) for the AI Educational Slideshow feature.
//
// The narration text is sent to OpenAI's TTS API and the returned MP3 is
// uploaded to Cloudinary (reusing the project's single Cloudinary account) so
// the audio has a public URL + a known duration — everything the slideshow
// video composer needs to time each slide.
//
// SECURITY: the API key lives ONLY on the server, in OPENAI_TTS_API_KEY. It is
// NEVER exposed to the frontend (no VITE_* variable). The browser calls the
// backend; the backend calls OpenAI.
//
// Env:
//   OPENAI_TTS_API_KEY   — required to use the feature (paid OpenAI credits).
//   OPENAI_TTS_MODEL     — default "gpt-4o-mini-tts".
//   OPENAI_TTS_BASE_URL  — default "https://api.openai.com/v1" (override for a
//                          compatible proxy). No trailing slash needed.
import { uploadBufferToCloudinary } from "./cloudinary.js";
import { normalizeVoice } from "../utils/ttsVoices.js";

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini-tts";

// Never send an enormous block of text in a single request — narration is split
// per slide upstream, but clamp here as a hard safety net (both for cost and to
// avoid the API rejecting an over-long input). ~1200 chars ≈ a long paragraph.
const MAX_TTS_CHARS = 1200;

// True only when a TTS API key is configured on the server.
export function isTtsConfigured() {
  return !!String(process.env.OPENAI_TTS_API_KEY || "").trim();
}

export function ttsModel() {
  return String(process.env.OPENAI_TTS_MODEL || "").trim() || DEFAULT_MODEL;
}

function ttsBaseUrl() {
  return String(process.env.OPENAI_TTS_BASE_URL || "").trim().replace(/\/+$/, "") || DEFAULT_BASE;
}

// Ask the TTS API to speak `text` in `voice` and return the raw MP3 bytes.
// Throws (with a readable message) on any failure — the caller decides how to
// surface it (the scheduler logs it and falls back to an image post).
export async function synthesizeSpeech({ text, voice, model, timeoutMs = 60000 } = {}) {
  const key = String(process.env.OPENAI_TTS_API_KEY || "").trim();
  if (!key) throw new Error("TTS is not configured (OPENAI_TTS_API_KEY missing).");
  const input = String(text || "").trim().slice(0, MAX_TTS_CHARS);
  if (!input) throw new Error("No narration text to synthesize.");
  const safeVoice = normalizeVoice(voice); // validated against the allow-list

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ttsBaseUrl()}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || ttsModel(),
        voice: safeVoice,
        input,
        response_format: "mp3",
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.error?.message || JSON.stringify(j);
      } catch {
        try { detail = await res.text(); } catch { /* ignore */ }
      }
      throw new Error(`TTS request failed (${res.status})${detail ? `: ${String(detail).slice(0, 200)}` : ""}`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (!buffer.length) throw new Error("TTS returned empty audio.");
    return { buffer, voice: safeVoice };
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("TTS request timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Synthesize narration AND host it on Cloudinary. Returns the hosted audio's
// public URL, Cloudinary public id (needed to compose the video) and duration
// in seconds. Throws on failure.
export async function generateNarrationAudio({ text, voice, model, folder = "mystudyguide/slideshow/audio" } = {}) {
  const { buffer, voice: usedVoice } = await synthesizeSpeech({ text, voice, model });
  const uploaded = await uploadBufferToCloudinary(buffer, {
    resourceType: "video", // Cloudinary stores audio as a "video" resource (carries a duration)
    folder,
    mime: "audio/mpeg",
  });
  return {
    url: uploaded.secure_url,
    publicId: uploaded.public_id,
    duration: Number(uploaded.duration) || 0,
    bytes: uploaded.bytes || buffer.length,
    voice: usedVoice,
  };
}
