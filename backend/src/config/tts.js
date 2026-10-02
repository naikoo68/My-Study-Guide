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
import { synthesizeGoogleSpeech } from "./googleTts.js";
import { synthesizeMyVoice, isVoiceServerConfigured, voiceOwnerFor } from "./myVoice.js";
import {
  normalizeProvider,
  normalizeVoiceForProvider,
  defaultVoiceForProvider,
  DEFAULT_TTS_PROVIDER,
  FREE_TTS_PROVIDERS,
  PAID_TTS_PROVIDERS,
} from "../utils/ttsVoices.js";
import { isSafeProviderUrl } from "../utils/urlGuard.js";

const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini-tts";
const ELEVENLABS_DEFAULT_MODEL = "eleven_multilingual_v2";

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
  const requested = normalizeProvider(site?.ttsProvider || (envKey ? "openai" : DEFAULT_TTS_PROVIDER));
  const s = (v) => String(v ?? "").trim();
  // Each paid provider has its own key (+ extras). Env vars are a fallback.
  const keys = {
    openai: s(site?.ttsApiKey) || envKey,
    elevenlabs: s(site?.ttsElevenLabsKey) || s(process.env.ELEVENLABS_API_KEY),
    googlecloud: s(site?.ttsGoogleCloudKey) || s(process.env.GOOGLE_CLOUD_TTS_API_KEY),
    azure: s(site?.ttsAzureKey) || s(process.env.AZURE_SPEECH_KEY),
    custom: s(site?.ttsCustomKey),
  };
  const azureRegion = s(site?.ttsAzureRegion) || s(process.env.AZURE_SPEECH_REGION);
  const customUrl = s(site?.ttsCustomUrl).replace(/\/+$/, "");
  const ready = {
    openai: !!keys.openai,
    elevenlabs: !!keys.elevenlabs,
    googlecloud: !!keys.googlecloud,
    azure: !!keys.azure && !!azureRegion,
    custom: !!customUrl, // some self-hosted APIs need no key
    myvoice: isVoiceServerConfigured(),
  };
  let provider = requested;
  let missing = "";
  if (PAID_TTS_PROVIDERS.includes(provider) && !ready[provider]) {
    // Graceful free fallback — and say why (shown to the admin).
    missing = provider === "azure" ? "the Azure key and region are not both saved"
      : provider === "custom" ? "no API URL is saved"
        : provider === "myvoice" ? "your voice server isn't set up (VOICE_SERVER_URL)" : "no API key is saved";
    provider = DEFAULT_TTS_PROVIDER;
  }
  const model = provider === "custom"
    ? s(site?.ttsCustomModel) || "tts-1"
    : provider === "elevenlabs"
      ? s(site?.ttsElevenLabsModel) || ELEVENLABS_DEFAULT_MODEL
      : s(site?.ttsModel) || s(process.env.OPENAI_TTS_MODEL) || OPENAI_DEFAULT_MODEL;
  const baseUrl = provider === "custom"
    ? customUrl
    : s(process.env.OPENAI_TTS_BASE_URL).replace(/\/+$/, "") || OPENAI_DEFAULT_BASE;
  return {
    provider,
    apiKey: keys[provider] || "",
    model,
    baseUrl,
    azureRegion,
    voiceOwner: voiceOwnerFor(site), // whose cloned voices ("myvoice")
    ...(missing ? { requestedProvider: requested, fallbackReason: missing } : {}),
  };
}

// TTS is ALWAYS available because the free Edge provider needs no key. Kept as a
// function (with an optional `site`) for symmetry with isCloudinaryConfigured().
export function isTtsConfigured() {
  return true;
}

const escapeXml = (s) =>
  String(s || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// POST to a TTS API with a timeout. Throws "<label> failed (<status>): <the
// service's own error message>" so the admin sees WHY (bad key, no credits,
// unknown voice…). Returns the Response when it's OK.
async function postTts(label, url, { headers, body }, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!res.ok) {
      let detail = "";
      try {
        const t = await res.text();
        try {
          const j = JSON.parse(t);
          detail = j?.error?.message || j?.detail?.message || (typeof j?.detail === "string" ? j.detail : "") || j?.message || t;
        } catch { detail = t; }
      } catch { /* ignore */ }
      if (!String(detail).trim() && (res.status === 401 || res.status === 403)) detail = "the API key (or region) was rejected — check it in Admin → AI Slideshow";
      throw new Error(`${label} failed (${res.status})${detail ? `: ${String(detail).replace(/\s+/g, " ").slice(0, 200)}` : ""}`);
    }
    return res;
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`${label} request timed out.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// A TTS API that answers with the MP3 bytes directly.
async function fetchAudio(label, url, req, voice) {
  const res = await postTts(label, url, req);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error(`${label} returned empty audio.`);
  return { buffer, voice };
}

// A TTS API that answers with JSON (e.g. base64 audio).
async function fetchJson(label, url, req) {
  const res = await postTts(label, url, req);
  return res.json();
}

// OpenAI (or any OpenAI-compatible) TTS → MP3 buffer.
async function synthesizeOpenAi({ text, voice, apiKey, model, baseUrl, label = "OpenAI TTS", keyOptional = false }) {
  if (!apiKey && !keyOptional) throw new Error(`${label} API key is missing.`);
  return fetchAudio(label, `${baseUrl || OPENAI_DEFAULT_BASE}/audio/speech`, {
    headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || OPENAI_DEFAULT_MODEL, voice, input: text, response_format: "mp3",
      // gpt-4o TTS models can be told HOW to speak (older tts-1 models can't,
      // and a custom API may reject unknown fields — so only for those).
      ...(!keyOptional && /^gpt-4o/i.test(model || OPENAI_DEFAULT_MODEL) ? { instructions: OPENAI_SPEAKING_STYLE } : {}),
    }),
  }, voice);
}
const OPENAI_SPEAKING_STYLE =
  "Speak with a natural Indian English accent, like a warm, friendly teacher explaining a quiz to students. " +
  "Clear and calm, at a moderate pace, with natural pauses between sentences. Sound human, not robotic.";

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
  if (provider === "custom") {
    // Any OpenAI-compatible speech API. The URL is admin-supplied and fetched
    // by the SERVER, so it must be https and never an internal address.
    if (!conf.baseUrl || !isSafeProviderUrl(conf.baseUrl)) {
      throw new Error("Custom TTS API URL must be a public https:// address.");
    }
    return synthesizeOpenAi({ text: input, voice: safeVoice, apiKey: conf.apiKey, model: conf.model, baseUrl: conf.baseUrl, label: "Custom TTS", keyOptional: true });
  }
  if (provider === "elevenlabs") {
    return fetchAudio("ElevenLabs", `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(safeVoice)}?output_format=mp3_44100_128`, {
      headers: { "xi-api-key": conf.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: input, model_id: conf.model || ELEVENLABS_DEFAULT_MODEL }),
    }, safeVoice);
  }
  if (provider === "googlecloud") {
    // Voice names look like "en-IN-Neural2-A"; the language is the first two parts.
    const languageCode = safeVoice.split("-").slice(0, 2).join("-") || "en-IN";
    const res = await fetchJson("Google Cloud TTS", `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(conf.apiKey)}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { text: input }, voice: { languageCode, name: safeVoice }, audioConfig: { audioEncoding: "MP3" } }),
    });
    const buffer = Buffer.from(String(res?.audioContent || ""), "base64");
    if (!buffer.length) throw new Error("Google Cloud TTS returned no audio.");
    return { buffer, voice: safeVoice };
  }
  if (provider === "azure") {
    const region = String(conf.azureRegion || "").trim().toLowerCase();
    if (!/^[a-z0-9]+$/.test(region)) throw new Error("Azure Speech region is invalid (e.g. centralindia, eastus).");
    const lang = safeVoice.split("-").slice(0, 2).join("-") || "en-US";
    const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${safeVoice}'>${escapeXml(input)}</voice></speak>`;
    return fetchAudio("Azure Speech", `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      headers: {
        "Ocp-Apim-Subscription-Key": conf.apiKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "MyStudyGuide",
      },
      body: ssml,
    }, safeVoice);
  }
  if (provider === "gtranslate") {
    return synthesizeGoogleSpeech({ text: input, lang: safeVoice });
  }
  if (provider === "myvoice") {
    return synthesizeMyVoice({ text: input, voice: safeVoice, owner: conf.voiceOwner || "default" });
  }
  // FREE Microsoft Edge neural TTS.
  return synthesizeEdgeSpeech({ text: input, voice: safeVoice });
}

// Pick a provider that ACTUALLY WORKS on this host. For a paid provider we trust
// the admin's explicit choice. For a FREE provider we do a tiny probe synth and,
// if it's blocked (e.g. Microsoft 403s Edge from datacenter IPs), automatically
// switch to the other free provider — so narration keeps working even if the
// saved provider is unreachable. Returns a (possibly updated) config.
export async function resolveWorkingTtsConfig(cfg) {
  const conf = cfg || resolveTtsConfig();
  // An explicit paid choice (key saved) — use it and surface its errors
  // (wrong key, no credits…) instead of hiding them behind a free voice.
  if (PAID_TTS_PROVIDERS.includes(conf.provider)) return conf;
  const order = [conf.provider, ...FREE_TTS_PROVIDERS.filter((p) => p !== conf.provider)];
  let firstError = "";
  for (const p of order) {
    try {
      await synthesizeSpeech({ text: "test", voice: defaultVoiceForProvider(p), cfg: { ...conf, provider: p } });
      // Say so when a DIFFERENT provider than the chosen one is used, and why —
      // otherwise every voice the admin picks silently sounds the same.
      if (p !== conf.provider) {
        console.warn(`[tts] ${conf.provider} is unavailable on this server (${firstError}); using ${p} instead.`);
        return { ...conf, provider: p, requestedProvider: conf.provider, fallbackReason: firstError };
      }
      return { ...conf, provider: p };
    } catch (e) {
      /* provider blocked/unavailable here — try the next free one */
      if (!firstError) firstError = String(e?.message || e).slice(0, 200);
    }
  }
  return conf; // none worked; caller will surface the failure
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
