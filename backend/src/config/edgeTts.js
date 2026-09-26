// FREE Text-to-Speech via Microsoft Edge's online "read aloud" service.
//
// This is the same neural TTS the Edge browser uses. It needs NO API key and no
// account, so the AI Slideshow feature works for free out of the box. It talks
// to Microsoft's WebSocket endpoint the same way the popular `edge-tts` tools
// do: authenticate with a computed Sec-MS-GEC token, send a speech config +
// SSML message, then collect the streamed MP3 audio chunks.
//
// NOTE: this is an UNOFFICIAL endpoint (it can change without notice), so the
// caller treats a failure as best-effort and falls back to a normal image post.
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_BASE = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
// The Chromium version advertised in Sec-MS-GEC-Version / User-Agent. Kept
// reasonably current; the token math (below) is what actually authenticates.
const CHROMIUM_FULL_VERSION = "130.0.2849.68";
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split(".")[0];
const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`;
// A high-quality mono MP3 output format.
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

// Windows epoch (1601-01-01) to Unix epoch (1970-01-01) offset, in seconds.
const WIN_EPOCH_OFFSET = 11644473600;
const S_TO_NS = 1e9;

// Compute the Sec-MS-GEC auth token: SHA-256, upper-case hex, of the current
// time expressed in Windows 100-nanosecond "ticks" ROUNDED DOWN to 5 minutes,
// concatenated with the fixed trusted client token.
//
// IMPORTANT: this MUST mirror the reference edge-tts implementation's IEEE-754
// FLOAT arithmetic exactly (not BigInt), because the server validates the hash
// of the SAME float-rounded tick string. JS `Number` is an IEEE-754 double —
// identical to Python's float — so `toFixed(0)` yields the same digits Python's
// `f"{ticks:.0f}"` produces. Using exact integers (BigInt) produces a DIFFERENT
// string and the endpoint rejects it with HTTP 403.
function generateSecMsGec() {
  let ticks = Date.now() / 1000;   // unix seconds (float), like Python time.time()
  ticks += WIN_EPOCH_OFFSET;
  ticks -= ticks % 300;            // floor to a 5-minute window
  ticks *= S_TO_NS / 100;          // seconds → 100-ns ticks (× 1e7)
  const toHash = `${ticks.toFixed(0)}${TRUSTED_TOKEN}`;
  return crypto.createHash("sha256").update(toHash, "ascii").digest("hex").toUpperCase();
}

const isoNow = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

const escapeXml = (s) =>
  String(s || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// Build the SSML request. `rate`/`pitch` are left neutral for a clear,
// educational, moderate pace.
function buildSsml(text, voice) {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

// Synthesize `text` in Edge `voice` (e.g. "en-IN-NeerjaNeural") and resolve with
// the MP3 audio as a Buffer. Rejects on timeout or a protocol/connection error.
export function synthesizeEdgeSpeech({ text, voice, timeoutMs = 60000 } = {}) {
  const input = String(text || "").trim();
  const voiceName = String(voice || "en-IN-NeerjaNeural").trim();
  return new Promise((resolve, reject) => {
    if (!input) return reject(new Error("No narration text to synthesize."));

    const sec = generateSecMsGec();
    const url =
      `${WSS_BASE}?TrustedClientToken=${TRUSTED_TOKEN}` +
      `&Sec-MS-GEC=${sec}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`;

    let ws;
    try {
      ws = new WebSocket(url, {
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-cache",
          "Origin": "chrome-extension://jdiccldimpahpijkmdrgnfmclphngdm",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": USER_AGENT,
        },
      });
    } catch (e) {
      return reject(e);
    }

    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.terminate(); } catch { /* ignore */ }
      reject(new Error("Edge TTS request timed out."));
    }, timeoutMs);

    const done = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) return reject(err);
      const audio = Buffer.concat(chunks);
      if (!audio.length) return reject(new Error("Edge TTS returned no audio."));
      resolve({ buffer: audio, voice: voiceName });
    };

    ws.on("open", () => {
      // 1) speech.config — audio output format + turn off word/sentence metadata.
      const config = {
        context: {
          synthesis: {
            audio: {
              metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
              outputFormat: OUTPUT_FORMAT,
            },
          },
        },
      };
      ws.send(
        `X-Timestamp:${isoNow()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify(config)
      );
      // 2) ssml — the actual text to speak.
      const requestId = randomUUID().replace(/-/g, "");
      ws.send(
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${isoNow()}\r\n` +
        `Path:ssml\r\n\r\n` +
        buildSsml(input, voiceName)
      );
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        // Binary frame: [2-byte big-endian header length][header][audio bytes].
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length < 2) return;
        const headerLen = buf.readUInt16BE(0);
        const audio = buf.subarray(2 + headerLen);
        if (audio.length) chunks.push(audio);
      } else {
        // Text frame: control messages. "Path:turn.end" ends the synthesis.
        const msg = data.toString();
        if (msg.includes("Path:turn.end")) done();
      }
    });

    ws.on("error", (err) => done(err instanceof Error ? err : new Error(String(err))));
    ws.on("close", () => { if (!settled) done(); });
  });
}
