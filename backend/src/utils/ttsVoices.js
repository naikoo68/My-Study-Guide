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
export const TTS_PROVIDERS = ["gtranslate", "edge", "openai"];
export const DEFAULT_TTS_PROVIDER = "gtranslate";
// The FREE providers (no API key). Used for automatic fallback: if the chosen
// free provider is blocked on the host, the other free one is tried.
export const FREE_TTS_PROVIDERS = ["gtranslate", "edge"];

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

// Google Translate TTS "voices" are language codes (a single voice per
// language). English is what the narration is written in.
const GTRANSLATE_VOICES = [
  { id: "en", label: "English" },
];

export const PROVIDER_VOICES = {
  gtranslate: GTRANSLATE_VOICES,
  openai: OPENAI_VOICES,
  edge: EDGE_VOICES,
};

// The default voice per provider.
export const DEFAULT_VOICE = {
  gtranslate: "en",
  openai: "coral",
  edge: "en-IN-NeerjaNeural",
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
  return match ? match.id : defaultVoiceForProvider(p);
}
