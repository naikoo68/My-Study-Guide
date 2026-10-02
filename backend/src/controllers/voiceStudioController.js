// Admin "Voice Studio" — record your voice, make a clone of it on YOUR OWN voice
// server (voice-server/), test it, tune it, and narrate every video with it.
// Recordings pass straight through to the voice server; nothing goes to an
// outside company.
import { getOrCreateOwn } from "./settingsController.js";
import { voiceCall, voiceOwnerFor, voiceServerUrl } from "../config/myVoice.js";

const ID = /^[a-z0-9]{6,40}$/;
const SAMPLE_ID = /^[a-f0-9]{10}$/;
function bad(res, message, status = 400) {
  return res.status(status).json({ message });
}
// The caller's OWN settings doc (never another institute's, even for the
// unscoped super-admin) → whose voices these are.
async function ctx() {
  const site = await getOrCreateOwn();
  return { site, owner: voiceOwnerFor(site) };
}
const filesForm = (files = [], fields = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  for (const f of files) form.append("files", new Blob([f.buffer], { type: f.mimetype || "application/octet-stream" }), f.originalname || "recording.webm");
  return form;
};
const dataUrl = ({ buffer, contentType }) => `data:${contentType};base64,${buffer.toString("base64")}`;

// GET /api/voice-studio/status — is the voice server up, and which voice narrates.
export async function status(_req, res) {
  const { site, owner } = await ctx();
  const out = {
    configured: !!voiceServerUrl(),
    server: null,
    error: "",
    narrator: { provider: site?.ttsProvider || "", voice: site?.slideshowVoice || "" },
    voices: [],
  };
  if (out.configured) {
    try {
      out.server = await voiceCall("/health", { owner, timeoutMs: 8000 });
      out.voices = (await voiceCall("/voices", { owner, timeoutMs: 8000 })).voices || [];
    } catch (e) { out.error = e.message; }
  }
  res.json(out);
}

export async function listVoices(_req, res) {
  const { owner } = await ctx();
  res.json(await voiceCall("/voices", { owner }));
}

// POST /api/voice-studio/voices (multipart: name, consent, files[])
export async function createVoice(req, res) {
  if (!["true", "1", "on"].includes(String(req.body?.consent))) return bad(res, "Confirm that this is your own voice (or that you have the speaker's permission).");
  const name = String(req.body?.name || "").replace(/[<>]/g, "").trim().slice(0, 80);
  if (!name) return bad(res, "Give the voice a name.");
  if (!req.files?.length) return bad(res, "Record or upload at least one recording.");
  const { owner } = await ctx();
  res.json(await voiceCall("/voices", { owner, method: "POST", form: filesForm(req.files, { name }), timeoutMs: 10 * 60 * 1000 }));
}

export async function updateVoice(req, res) {
  if (!ID.test(req.params.id)) return bad(res, "Invalid voice.");
  const { owner } = await ctx();
  const body = {};
  if (typeof req.body?.name === "string") body.name = req.body.name.replace(/[<>]/g, "").trim().slice(0, 80);
  if (req.body?.settings && typeof req.body.settings === "object") {
    body.settings = Object.fromEntries(Object.entries(req.body.settings).filter(([k, v]) => /^[a-z_]{1,30}$/.test(k) && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
  }
  res.json(await voiceCall(`/voices/${req.params.id}`, { owner, method: "PATCH", json: body, timeoutMs: 120000 }));
}

export async function deleteVoice(req, res) {
  if (!ID.test(req.params.id)) return bad(res, "Invalid voice.");
  const { site, owner } = await ctx();
  const out = await voiceCall(`/voices/${req.params.id}`, { owner, method: "DELETE" });
  // The narrator can't keep a deleted voice → back to the free Indian voice.
  if (site.ttsProvider === "myvoice" && site.slideshowVoice === req.params.id) {
    site.ttsProvider = "gtranslate";
    site.slideshowVoice = "en-IN";
    await site.save();
    out.narratorReset = true;
  }
  res.json(out);
}

export async function addSamples(req, res) {
  if (!ID.test(req.params.id)) return bad(res, "Invalid voice.");
  if (!req.files?.length) return bad(res, "Record or upload at least one recording.");
  const { owner } = await ctx();
  res.json(await voiceCall(`/voices/${req.params.id}/samples`, { owner, method: "POST", form: filesForm(req.files), timeoutMs: 10 * 60 * 1000 }));
}

export async function sampleAudio(req, res) {
  if (!ID.test(req.params.id) || !SAMPLE_ID.test(req.params.sampleId)) return bad(res, "Invalid recording.");
  const { owner } = await ctx();
  res.json({ audio: dataUrl(await voiceCall(`/voices/${req.params.id}/samples/${req.params.sampleId}`, { owner, expect: "audio" })) });
}

export async function deleteSample(req, res) {
  if (!ID.test(req.params.id) || !SAMPLE_ID.test(req.params.sampleId)) return bad(res, "Invalid recording.");
  const { owner } = await ctx();
  res.json(await voiceCall(`/voices/${req.params.id}/samples/${req.params.sampleId}`, { owner, method: "DELETE", timeoutMs: 120000 }));
}

// POST /api/voice-studio/speak { voiceId, text, settings? } — hear it (and try
// settings before saving them).
export async function speak(req, res) {
  const { voiceId, text, settings } = req.body || {};
  if (!ID.test(String(voiceId || ""))) return bad(res, "Pick a voice.");
  const input = String(text || "").trim().slice(0, 1500);
  if (!input) return bad(res, "Type something to read aloud.");
  const { owner } = await ctx();
  const started = Date.now();
  const r = await voiceCall("/v1/audio/speech", {
    owner, method: "POST", expect: "audio", timeoutMs: 15 * 60 * 1000,
    json: { input, voice: voiceId, response_format: "mp3", ...(settings && typeof settings === "object" ? { settings } : {}) },
  });
  res.json({ audio: dataUrl(r), seconds: Math.round((Date.now() - started) / 100) / 10 });
}

// POST /api/voice-studio/narrator { voiceId } — every video narrates in it.
export async function useAsNarrator(req, res) {
  const voiceId = String(req.body?.voiceId || "");
  if (!ID.test(voiceId)) return bad(res, "Pick a voice.");
  const { site, owner } = await ctx();
  const v = await voiceCall(`/voices/${voiceId}`, { owner });
  if (!v.ready) return bad(res, "That voice isn't ready yet — add more recordings.");
  site.ttsProvider = "myvoice";
  site.slideshowVoice = voiceId;
  await site.save();
  res.json({ ok: true, narrator: { provider: "myvoice", voice: voiceId } });
}
