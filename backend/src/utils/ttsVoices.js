// Text-to-Speech providers and their voices — one shared source of truth so the
// schedule model, the field whitelist, the TTS service and the Admin UI all
// agree on the allowed providers/voices.
//
// Two providers are supported out of the box:
//   • "edge"   — Microsoft Edge online TTS. FREE, needs NO API key. Neural
//                voices. This is the default so the AI Slideshow works with no
//                paid account and nothing to configure.
//   • "openai" — OpenAI TTS (gpt-4o-mini-tts). Needs an API key (entered in the
//                Admin panel or an env var). Paid.
// New providers can be added later without touching the callers.

// Three providers out of the box:
//   • "gtranslate" — FREE Google Translate TTS. No key. Reachable from cloud
//                    servers (works where Edge is IP-blocked). Default.
//   • "edge"       — FREE Microsoft Edge neural TTS. No key. Better quality, but
//                    Microsoft blocks many datacenter IPs (may 403 on a VPS).
//   • "openai"     — OpenAI TTS. Needs an API key. Paid.
// Paid providers (each needs its own API key, entered in Admin → AI Slideshow):
//   • "openai"      — OpenAI TTS.
//   • "elevenlabs"  — ElevenLabs (premade voices, or any voice ID from your account).
//   • "googlecloud" — Google Cloud Text-to-Speech (Neural2 / WaveNet voices).
//   • "azure"       — Microsoft Azure Speech (needs the key AND its region).
//   • "custom"      — ANY OpenAI-compatible speech API (your base URL + key +
//                     model + voice), e.g. a self-hosted or third-party service.
export const TTS_PROVIDERS = ["gtranslate", "edge", "openai", "elevenlabs", "googlecloud", "azure", "custom"];
export const DEFAULT_TTS_PROVIDER = "gtranslate";
// The FREE providers (no API key). Used for automatic fallback: if the chosen
// free provider is blocked on the host, the other free one is tried.
export const FREE_TTS_PROVIDERS = ["gtranslate", "edge"];
export const PAID_TTS_PROVIDERS = TTS_PROVIDERS.filter((p) => !FREE_TTS_PROVIDERS.includes(p));

// Settings field holding each paid provider's API key. SECRET — never sent to
// the browser (settingsController masks each as `<field>Set`).
export const TTS_KEY_FIELDS = {
  openai: "ttsApiKey", // original field name, kept for saved settings
  elevenlabs: "ttsElevenLabsKey",
  googlecloud: "ttsGoogleCloudKey",
  azure: "ttsAzureKey",
  custom: "ttsCustomKey",
};

// Providers whose voice is free text as well as the listed suggestions
// (ElevenLabs voice IDs from your own account, any Azure / Google Cloud voice
// name, whatever voice a custom API offers).
export const FREE_FORM_VOICE_PROVIDERS = new Set(["elevenlabs", "googlecloud", "azure", "custom"]);
const SAFE_VOICE_ID = /^[A-Za-z0-9._:-]{1,80}$/;

// OpenAI standard TTS voices.
const OPENAI_VOICES = [
  { id: "alloy", label: "Alloy" },
  { id: "ash", label: "Ash" },
  { id: "coral", label: "Coral" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "nova", label: "Nova" },
  { id: "onyx", label: "Onyx" },
  { id: "sage", label: "Sage" },
  { id: "shimmer", label: "Shimmer" },
];

// A curated set of Microsoft Edge neural voices (English, incl. India-first
// picks since the audience is Indian exam aspirants). The `id` is the exact
// Edge voice name required by the service.
const EDGE_VOICES = [
  { id: "en-IN-NeerjaNeural", label: "Neerja (India, female)" },
  { id: "en-IN-PrabhatNeural", label: "Prabhat (India, male)" },
  { id: "en-US-AriaNeural", label: "Aria (US, female)" },
  { id: "en-US-GuyNeural", label: "Guy (US, male)" },
  { id: "en-US-JennyNeural", label: "Jenny (US, female)" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK, female)" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK, male)" },
  { id: "en-AU-NatashaNeural", label: "Natasha (Australia, female)" },
];

// Google Translate TTS "voices" are language codes — one voice per code, but
// the regional English codes give genuinely different accents (verified: each
// returns different audio). "en" is kept as the id of the US voice so saved
// settings keep working.
const GTRANSLATE_VOICES = [
  { id: "en-IN", label: "English (India)" },
  { id: "en", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "en-AU", label: "English (Australia)" },
];

// ElevenLabs premade voices (IDs are the same for every account). Any other
// voice ID from your ElevenLabs Voice Library can be typed in instead.
const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (female)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella (female)" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli (female)" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam (male)" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni (male)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh (male)" },
];

// Google Cloud TTS voices (name = "<language>-<type>-<letter>").
const GOOGLECLOUD_VOICES = [
  { id: "en-IN-Neural2-A", label: "India, female (Neural2-A)" },
  { id: "en-IN-Neural2-B", label: "India, male (Neural2-B)" },
  { id: "en-IN-Neural2-C", label: "India, male (Neural2-C)" },
  { id: "en-IN-Neural2-D", label: "India, female (Neural2-D)" },
  { id: "en-US-Neural2-F", label: "US, female (Neural2-F)" },
  { id: "en-US-Neural2-D", label: "US, male (Neural2-D)" },
  { id: "en-GB-Neural2-A", label: "UK, female (Neural2-A)" },
  { id: "en-GB-Neural2-B", label: "UK, male (Neural2-B)" },
];

// Azure Speech uses the same neural voice names as Edge (plus hundreds more).
const AZURE_VOICES = EDGE_VOICES;

export const PROVIDER_VOICES = {
  gtranslate: GTRANSLATE_VOICES,
  openai: OPENAI_VOICES,
  edge: EDGE_VOICES,
  elevenlabs: ELEVENLABS_VOICES,
  googlecloud: GOOGLECLOUD_VOICES,
  azure: AZURE_VOICES,
  custom: OPENAI_VOICES, // suggestions — most OpenAI-compatible APIs accept these
};

// The default voice per provider.
export const DEFAULT_VOICE = {
  gtranslate: "en",
  openai: "coral",
  edge: "en-IN-NeerjaNeural",
  elevenlabs: "21m00Tcm4TlvDq8ikWAM",
  googlecloud: "en-IN-Neural2-A",
  azure: "en-IN-NeerjaNeural",
  custom: "alloy",
};

// Back-compat: a flat list of OpenAI voice ids (the feature originally shipped
// OpenAI-only). Still exported so older imports keep working.
export const TTS_VOICES = OPENAI_VOICES.map((v) => v.id);
export const DEFAULT_TTS_VOICE = "coral";

export function normalizeProvider(p) {
  const s = String(p || "").trim().toLowerCase();
  return TTS_PROVIDERS.includes(s) ? s : DEFAULT_TTS_PROVIDER;
}

export function voicesForProvider(p) {
  return PROVIDER_VOICES[normalizeProvider(p)] || EDGE_VOICES;
}

export function defaultVoiceForProvider(p) {
  return DEFAULT_VOICE[normalizeProvider(p)] || EDGE_VOICES[0].id;
}

export function isAllowedVoice(provider, v) {
  const id = String(v || "").trim();
  return voicesForProvider(provider).some((x) => x.id.toLowerCase() === id.toLowerCase());
}

// Return a SAFE voice id for the given provider — falls back to that provider's
// default when the value is empty or doesn't belong to the provider. Never
// throws, so it can be used right before building a request.
export function normalizeVoiceForProvider(provider, v) {
  const p = normalizeProvider(provider);
  const id = String(v || "").trim();
  const match = voicesForProvider(p).find((x) => x.id.toLowerCase() === id.toLowerCase());
  if (match) return match.id;
  // A typed-in voice (e.g. your own ElevenLabs voice ID) for providers that allow it.
  if (FREE_FORM_VOICE_PROVIDERS.has(p) && SAFE_VOICE_ID.test(id)) return id;
  return defaultVoiceForProvider(p);
}

// The English accent of a voice id: "en-IN-NeerjaNeural" / "en-IN" → "IN";
// "en" / "en-US-…" → "US"; unknown (e.g. OpenAI "coral") → "".
function accentOf(voice) {
  const m = /^en(?:-([A-Z]{2}))?(?:-|$)/i.exec(String(voice || "").trim());
  return m ? (m[1] || "US").toUpperCase() : "";
}

// When the chosen FREE provider is blocked on the server and the other one is
// used instead, keep the admin's chosen ACCENT (Neerja → Google India, Google
// UK → Sonia, …) rather than jumping to the other provider's default voice.
export function voiceForFallback(toProvider, fromVoice) {
  const to = normalizeProvider(toProvider);
  const accent = accentOf(fromVoice);
  if (accent) {
    const same = voicesForProvider(to).find((x) => accentOf(x.id) === accent);
    if (same) return same.id;
  }
  return defaultVoiceForProvider(to);
}
