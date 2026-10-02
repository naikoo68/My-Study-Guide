// "My own voice" — the self-hosted voice server (voice-server/, Chatterbox).
// It clones the admin's voice from their recordings and narrates in it, on our
// own machine: nothing goes to an outside company.
//
// Env:
//   VOICE_SERVER_URL    e.g. http://msg-voice:8000 (the container next to this one)
//   VOICE_SERVER_TOKEN  shared secret; the voice server must have the same one
//
// Every voice belongs to an owner — the institute (tenant) of the settings doc —
// so institutes never see or use each other's voices.

export function voiceServerUrl() {
  return String(process.env.VOICE_SERVER_URL || "").trim().replace(/\/+$/, "");
}
export const isVoiceServerConfigured = () => !!voiceServerUrl();

// The owner id for a settings doc (the same value at upload time and at render
// time, whoever runs the job).
export function voiceOwnerFor(site) {
  const t = site?.tenantId ? String(site.tenantId) : "";
  return /^[A-Za-z0-9_-]{1,64}$/.test(t) ? t : "default";
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// One call to the voice server. expect: "json" | "audio" (→ { buffer, contentType }).
export async function voiceCall(path, { owner = "default", method = "GET", json, form, expect = "json", timeoutMs = 60000 } = {}) {
  const base = voiceServerUrl();
  if (!base) throw httpError(400, "Your voice server isn't set up yet (VOICE_SERVER_URL) — see voice-server/README.md.");
  const headers = { "X-Voice-Owner": owner };
  const token = String(process.env.VOICE_SERVER_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  else if (form) body = form;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(base + path, { method, headers, body, signal: controller.signal });
  } catch (e) {
    // 424 rather than 502/504: the admin app auto-retries those.
    if (e?.name === "AbortError") throw httpError(424, "Your voice server took too long to answer.");
    throw httpError(424, `Can't reach your voice server (${base}): ${e?.cause?.code || e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = "";
    const text = await res.text().catch(() => "");
    try { const j = JSON.parse(text); msg = typeof j.detail === "string" ? j.detail : j.detail?.[0]?.msg || j.message || ""; } catch { msg = text; }
    msg = String(msg || `error ${res.status}`).replace(/\s+/g, " ").slice(0, 300);
    if (res.status === 401) throw httpError(424, "Your voice server rejected the token — VOICE_SERVER_TOKEN must be the same on both servers.");
    // Pass "not found" / "bad recording" through; anything else becomes 424.
    throw httpError([400, 404, 413].includes(res.status) ? res.status : res.status === 503 ? 409 : 424, msg);
  }
  if (expect === "audio") {
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw httpError(424, "Your voice server returned no audio.");
    return { buffer, contentType: (res.headers.get("content-type") || "audio/mpeg").split(";")[0] };
  }
  return res.json();
}

// Narration in a cloned voice → MP3. A CPU makes roughly 0.5–1 s of speech per
// second (and one request at a time), so the wait is long by design.
export async function synthesizeMyVoice({ text, voice, owner, settings }) {
  // Voice-server ids are short lowercase hex; anything else is a leftover name
  // from another engine (e.g. "coral").
  if (!/^[a-z0-9]{6,40}$/.test(String(voice || ""))) throw httpError(400, "Pick one of your own voices (Admin → Voice Studio → Use as narrator).");
  const r = await voiceCall("/v1/audio/speech", {
    owner, method: "POST", expect: "audio", timeoutMs: 20 * 60 * 1000,
    json: { input: text, voice, response_format: "mp3", ...(settings ? { settings } : {}) },
  });
  return { buffer: r.buffer, voice };
}

// [{ id, label }] for the narrator dropdowns. Never throws.
export async function myVoiceOptions(owner) {
  if (!isVoiceServerConfigured()) return [];
  try {
    const { voices = [] } = await voiceCall("/voices", { owner, timeoutMs: 5000 });
    return voices.filter((v) => v.ready).map((v) => ({ id: v.id, label: `${v.name} (my voice)` }));
  } catch {
    return [];
  }
}
