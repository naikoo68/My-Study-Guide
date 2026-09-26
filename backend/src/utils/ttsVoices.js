// The set of Text-to-Speech voices the AI Slideshow feature may use. These are
// the standard OpenAI TTS voices (used with the gpt-4o-mini-tts model). Keeping
// the list here — one shared source of truth — lets the schedule model default,
// the field whitelist (pickScheduleFields), the TTS service and the Admin UI all
// agree on exactly which voices are allowed, so an invalid value can never reach
// the paid API.

// Lower-case ids exactly as the OpenAI TTS API expects them.
export const TTS_VOICES = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
];

// The default voice used when a schedule doesn't specify one.
export const DEFAULT_TTS_VOICE = "coral";

// True when `v` is one of the allowed voices (case-insensitive).
export function isAllowedVoice(v) {
  return TTS_VOICES.includes(String(v || "").trim().toLowerCase());
}

// Normalise any incoming value to a SAFE allowed voice — falls back to the
// default when the value is empty or not in the allow-list. Never throws, so it
// can be used directly when building a TTS request.
export function normalizeVoice(v) {
  const s = String(v || "").trim().toLowerCase();
  return isAllowedVoice(s) ? s : DEFAULT_TTS_VOICE;
}
