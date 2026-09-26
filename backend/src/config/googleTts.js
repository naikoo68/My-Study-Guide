// FREE Text-to-Speech via Google Translate's "listen" endpoint.
//
// Unlike the Edge endpoint (which Microsoft blocks from many datacenter IPs),
// this reaches Google Translate's public translate_tts endpoint — reachable from
// cloud servers — needs NO API key/account, and returns MP3. Its one limit is
// ~200 characters per request, so we split each slide's narration into short
// chunks and concatenate the audio (Cloudinary re-encodes it into the final
// video anyway). Voice is a language code ("en"). Best-effort/unofficial.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_CHUNK = 190; // stay safely under the ~200-char endpoint limit

// Split text into <=MAX_CHUNK pieces, breaking on sentence then word boundaries
// so each chunk is speakable on its own.
export function chunkForGoogle(text, maxLen = MAX_CHUNK) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const chunks = [];
  let cur = "";
  const pushCur = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;
    if (s.length > maxLen) {
      pushCur();
      let w = "";
      for (const word of s.split(" ")) {
        if ((w + " " + word).trim().length <= maxLen) w = (w + " " + word).trim();
        else { if (w) chunks.push(w); w = word.length > maxLen ? word.slice(0, maxLen) : word; }
      }
      if (w) cur = w;
    } else if ((cur + " " + s).trim().length <= maxLen) {
      cur = (cur + " " + s).trim();
    } else {
      pushCur();
      cur = s;
    }
  }
  pushCur();
  return chunks;
}

// Synthesize `text` in `lang` (default "en") → { buffer (MP3), voice }.
export async function synthesizeGoogleSpeech({ text, lang = "en", timeoutMs = 20000 } = {}) {
  const chunks = chunkForGoogle(text);
  if (!chunks.length) throw new Error("No narration text to synthesize.");
  const language = String(lang || "en").trim() || "en";
  const buffers = [];
  for (const chunk of chunks) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(language)}` +
      `&q=${encodeURIComponent(chunk)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Referer: "https://translate.google.com/" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Google TTS failed (${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length) buffers.push(buf);
    } catch (err) {
      if (err?.name === "AbortError") throw new Error("Google TTS request timed out.");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  const audio = Buffer.concat(buffers);
  if (!audio.length) throw new Error("Google TTS returned no audio.");
  return { buffer: audio, voice: language };
}
