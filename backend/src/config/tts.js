// Server-side Text-to-Speech for the AI Educational Slideshow.
//
// Two providers (see utils/ttsVoices.js):
//   • "edge"   — Microsoft Edge online TTS. FREE, NO API key. Default.
//   • "openai" — OpenAI TTS (gpt-4o-mini-tts). Needs an API key.
//
// The provider + key + model are configured by the admin in the Admin → Facebook
// panel (stored on the site Settings doc, key masked like the FB token), with an
// environment-variable fallback for the OpenAI key. The API key lives ONLY on
// the server — NEVER exposed to the frontend (no VITE_* variable).
//
// Env fallback (optional):
//   OPENAI_TTS_API_KEY, OPENAI_TTS_MODEL (default gpt-4o-mini-tts),
//   OPENAI_TTS_BASE_URL (default https://api.openai.com/v1).
import { uploadBufferToCloudinary } from "./cloudinary.js";
import { synthesizeEdgeSpeech } from "./edgeTts.js";
import { normalizeProvider, normalizeVoiceForProvider } from "../utils/ttsVoices.js";

const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini-tts";

// Never send an enormous block of text in one request (cost + API limits).
// Narration is split per slide upstream; this is a hard safety net.
const MAX_TTS_CHARS = 1200;

function envOpenAiKey() {
  return String(process.env.OPENAI_TTS_API_KEY || "").trim();
}

// Resolve the effective TTS config from the site settings (+ env fallback).
// `site` is the RAW settings document (carries the unmasked ttsApiKey). Returns
// { provider, apiKey, model, baseUrl }. If the chosen provider is "openai" but
// no key is available anywhere, it falls back to the FREE "edge" provider so the
// feature keeps working.
export function resolveTtsConfig(site = null) {
  const envKey = envOpenAiKey();
  let provider = normalizeProvider(site?.ttsProvider || (envKey ? "openai" : "edge"));
  const apiKey = String(site?.ttsApiKey || "").trim() || envKey;
  if (provider === "openai" && !apiKey) provider = "edge"; // graceful free fallback
  const model = String(site?.ttsModel || "").trim() || String(process.env.OPENAI_TTS_MODEL || "").trim() || OPENAI_DEFAULT_MODEL;
  const baseUrl = String(process.env.OPENAI_TTS_BASE_URL || "").trim().replace(/\/+$/, "") || OPENAI_DEFAULT_BASE;
  return { provider, apiKey, model, baseUrl };
}

// TTS is ALWAYS available because the free Edge provider needs no key. Kept as a
// function (with an optional `site`) for symmetry with isCloudinaryConfigured().
export function isTtsConfigured() {
  return true;
}

// OpenAI TTS → MP3 buffer.
async function synthesizeOpenAi({ text, voice, apiKey, model, baseUrl, timeoutMs = 60000 }) {
  if (!apiKey) throw new Error("OpenAI TTS API key is missing.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl || OPENAI_DEFAULT_BASE}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: model || OPENAI_DEFAULT_MODEL, voice, input: text, response_format: "mp3" }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j?.error?.message || JSON.stringify(j); }
      catch { try { detail = await res.text(); } catch { /* ignore */ } }
      throw new Error(`OpenAI TTS failed (${res.status})${detail ? `: ${String(detail).slice(0, 200)}` : ""}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error("OpenAI TTS returned empty audio.");
    return { buffer, voice };
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("OpenAI TTS request timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Synthesize narration to MP3 bytes using the resolved provider. `cfg` is the
// output of resolveTtsConfig(); `voice` is normalised to the provider here.
export async function synthesizeSpeech({ text, voice, cfg } = {}) {
  const conf = cfg || resolveTtsConfig();
  const provider = normalizeProvider(conf.provider);
  const input = String(text || "").trim().slice(0, MAX_TTS_CHARS);
  if (!input) throw new Error("No narration text to synthesize.");
  const safeVoice = normalizeVoiceForProvider(provider, voice);
  if (provider === "openai") {
    return synthesizeOpenAi({ text: input, voice: safeVoice, apiKey: conf.apiKey, model: conf.model, baseUrl: conf.baseUrl });
  }
  // Default: FREE Edge TTS.
  return synthesizeEdgeSpeech({ text: input, voice: safeVoice });
}

// Synthesize AND host on Cloudinary. Returns { url, publicId, duration, bytes,
// voice, provider }. Throws on failure.
export async function generateNarrationAudio({ text, voice, cfg, folder = "mystudyguide/slideshow/audio" } = {}) {
  const conf = cfg || resolveTtsConfig();
  const { buffer, voice: usedVoice } = await synthesizeSpeech({ text, voice, cfg: conf });
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
    provider: normalizeProvider(conf.provider),
  };
}
