"""My Study Guide — self-hosted voice server ("My own voice").

Clones YOUR voice from a short recording and narrates any text in it. Runs on
your own server (CPU is enough); nothing is sent to any outside company.

Engine: Chatterbox (Resemble AI, MIT licence — fine for commercial use).
  VOICE_MODEL=turbo     (default) faster, good on a CPU; supports tags like
                        [laugh] [chuckle] [sigh] [clear throat] in the text.
  VOICE_MODEL=standard  slower; adds "emotion" (exaggeration) + "pace" (cfg).

Every voice belongs to an owner (the X-Voice-Owner header — the backend sends
the institute/tenant id), so institutes never see each other's voices.

Endpoints (all need "Authorization: Bearer $VOICE_SERVER_TOKEN" when it is set):
  GET    /health
  GET    /voices                         list your voices
  POST   /voices                         create a voice (form: name, files[])
  GET    /voices/{id}
  PATCH  /voices/{id}                    rename / change voice settings
  DELETE /voices/{id}
  POST   /voices/{id}/samples            add more recordings (form: files[])
  GET    /voices/{id}/samples/{sid}      play one recording (wav)
  DELETE /voices/{id}/samples/{sid}
  POST   /v1/audio/speech                OpenAI-style text → speech (mp3/wav)
"""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

log = logging.getLogger("voice-server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DATA = Path(os.getenv("DATA_DIR", "/data"))
VOICES = DATA / "voices"
TOKEN = os.getenv("VOICE_SERVER_TOKEN", "").strip()
MODEL_KIND = "standard" if os.getenv("VOICE_MODEL", "turbo").strip().lower() == "standard" else "turbo"
THREADS = int(os.getenv("TORCH_THREADS", "0") or 0) or (os.cpu_count() or 2)
SR = 24000  # the rate recordings are stored at (the model's own rate)
MAX_UPLOAD_MB = 50
MIN_VOICE_SECONDS = 6  # the model needs more than 5 s of speech
MAX_REFERENCE_SECONDS = 60  # longer adds nothing
MAX_TEXT = 5000
CHUNK_CHARS = 280  # the model is best on sentence-sized pieces

TURBO_DEFAULTS = {"temperature": 0.8, "top_p": 0.95, "repetition_penalty": 1.2, "speed": 1.0, "pause_ms": 250}
STANDARD_DEFAULTS = {"exaggeration": 0.5, "cfg_weight": 0.5, "temperature": 0.8, "speed": 1.0, "pause_ms": 250}
DEFAULTS = TURBO_DEFAULTS if MODEL_KIND == "turbo" else STANDARD_DEFAULTS
LIMITS = {
    "temperature": (0.3, 1.2), "top_p": (0.5, 1.0), "repetition_penalty": (1.0, 2.0),
    "exaggeration": (0.25, 1.5), "cfg_weight": (0.0, 1.0), "speed": (0.8, 1.25), "pause_ms": (0, 1500),
}

state = {"model": None, "error": "", "loading": True, "loadedAt": None}
model_lock = threading.Lock()  # one generation at a time (the model isn't thread-safe)
conds_cache: dict = {}  # (owner, id) → (mtime, Conditionals)


# ---------------------------------------------------------------- model
def load_model():
    try:
        import torch
        torch.set_num_threads(THREADS)
        t = time.time()
        if MODEL_KIND == "turbo":
            from chatterbox.tts_turbo import ChatterboxTurboTTS as M
        else:
            from chatterbox.tts import ChatterboxTTS as M
        state["model"] = M.from_pretrained(device="cpu")
        state["loadedAt"] = time.time()
        log.info("Chatterbox %s loaded in %.0fs (%d threads)", MODEL_KIND, time.time() - t, THREADS)
    except Exception as e:  # keep serving /health with the reason
        log.exception("Model failed to load")
        state["error"] = str(e)
    finally:
        state["loading"] = False


def conditionals_class():
    if MODEL_KIND == "turbo":
        from chatterbox.tts_turbo import Conditionals
    else:
        from chatterbox.tts import Conditionals
    return Conditionals


def need_model():
    if state["model"] is None:
        if state["loading"]:
            raise HTTPException(503, "The voice model is still loading (first start downloads it — a few minutes). Try again shortly.")
        raise HTTPException(500, f"The voice model failed to load: {state['error'] or 'unknown error'}")
    return state["model"]


@asynccontextmanager
async def lifespan(_app):
    VOICES.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=load_model, daemon=True).start()
    yield


app = FastAPI(title="My Study Guide voice server", lifespan=lifespan)


# ---------------------------------------------------------------- auth / owner
def auth(authorization: str = Header(default="")):
    if TOKEN and not secrets.compare_digest(authorization, f"Bearer {TOKEN}"):
        raise HTTPException(401, "Wrong voice server token.")


def owner_dir(x_voice_owner: str = Header(default="default")) -> Path:
    owner = re.sub(r"[^A-Za-z0-9_-]", "", x_voice_owner or "")[:64] or "default"
    d = VOICES / owner
    d.mkdir(parents=True, exist_ok=True)
    return d


ID_RE = re.compile(r"^[a-z0-9]{6,40}$")


def voice_dir(owner: Path, vid: str) -> Path:
    if not ID_RE.match(vid or "") or not (owner / vid / "meta.json").exists():
        raise HTTPException(404, "Voice not found.")
    return owner / vid


def read_meta(vdir: Path) -> dict:
    return json.loads((vdir / "meta.json").read_text())


def write_meta(vdir: Path, meta: dict):
    meta["updatedAt"] = int(time.time() * 1000)
    tmp = vdir / "meta.json.tmp"
    tmp.write_text(json.dumps(meta, indent=1))
    tmp.replace(vdir / "meta.json")


def public(meta: dict) -> dict:
    return {
        "id": meta["id"], "name": meta["name"], "createdAt": meta["createdAt"], "updatedAt": meta.get("updatedAt"),
        "samples": meta.get("samples", []), "seconds": round(sum(s["seconds"] for s in meta.get("samples", [])), 1),
        "settings": {**DEFAULTS, **{k: v for k, v in meta.get("settings", {}).items() if k in DEFAULTS}},
        "model": MODEL_KIND, "ready": meta.get("ready", False),
    }


# ---------------------------------------------------------------- audio helpers
def ffmpeg(*args: str, data: Optional[bytes] = None) -> bytes:
    p = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", *args], input=data, capture_output=True, timeout=300)
    if p.returncode != 0:
        raise HTTPException(400, f"Could not read that audio: {p.stderr.decode(errors='ignore')[-300:] or 'unknown format'}")
    return p.stdout


def to_clean_wav(raw: bytes) -> np.ndarray:
    """Any recording (webm/m4a/mp3/wav…) → 24 kHz mono float, silence trimmed."""
    import librosa
    pcm = ffmpeg("-i", "pipe:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1", data=raw)
    wav = np.frombuffer(pcm, dtype=np.float32).copy()
    if wav.size < SR:  # < 1 s
        raise HTTPException(400, "That recording is too short.")
    # Cut long silences anywhere (pauses while reading), keep natural short ones.
    parts = librosa.effects.split(wav, top_db=38, frame_length=1024, hop_length=256)
    gap = np.zeros(int(0.25 * SR), dtype=np.float32)
    kept = []
    for a, b in parts:
        kept += [wav[max(0, a - 1200):min(wav.size, b + 1200)], gap]
    wav = np.concatenate(kept[:-1]) if kept else wav
    peak = float(np.max(np.abs(wav))) or 1.0
    if peak < 0.02:
        raise HTTPException(400, "That recording is almost silent — check the microphone.")
    return (wav / peak * 0.9).astype(np.float32)


async def save_uploads(vdir: Path, files: list[UploadFile]) -> list[dict]:
    if not files:
        raise HTTPException(400, "Add at least one recording.")
    (vdir / "samples").mkdir(exist_ok=True)
    added = []
    for f in files[:20]:
        raw = await f.read()
        if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(413, f"Each recording can be up to {MAX_UPLOAD_MB} MB.")
        wav = await run_in_threadpool(to_clean_wav, raw)
        sid = secrets.token_hex(5)
        sf.write(vdir / "samples" / f"{sid}.wav", wav, SR, subtype="PCM_16")
        name = re.sub(r"[^\w .()-]", "", f.filename or "recording")[:80] or "recording"
        added.append({"id": sid, "name": name, "seconds": round(wav.size / SR, 1)})
    return added


def rebuild(vdir: Path, meta: dict):
    """Join the recordings into one reference clip and pre-compute the voice."""
    samples = meta.get("samples", [])
    total = sum(s["seconds"] for s in samples)
    if total < MIN_VOICE_SECONDS:
        meta["ready"] = False
        (vdir / "conds.pt").unlink(missing_ok=True)
        conds_cache.pop((vdir.parent.name, vdir.name), None)
        return
    gap = np.zeros(int(0.3 * SR), dtype=np.float32)
    parts, secs = [], 0.0
    for s in samples:
        w, _ = sf.read(vdir / "samples" / f"{s['id']}.wav", dtype="float32")
        parts += [w, gap]
        secs += w.size / SR
        if secs >= MAX_REFERENCE_SECONDS:
            break
    ref = np.concatenate(parts[:-1])[: MAX_REFERENCE_SECONDS * SR]
    sf.write(vdir / "reference.wav", ref, SR, subtype="PCM_16")
    model = need_model()
    with model_lock:
        if MODEL_KIND == "standard":
            model.prepare_conditionals(str(vdir / "reference.wav"), exaggeration=float(meta.get("settings", {}).get("exaggeration", 0.5)))
        else:
            model.prepare_conditionals(str(vdir / "reference.wav"))
        model.conds.save(vdir / "conds.pt")
    conds_cache.pop((vdir.parent.name, vdir.name), None)
    meta["ready"] = True


def load_conds(vdir: Path):
    path = vdir / "conds.pt"
    if not path.exists():
        raise HTTPException(400, f"This voice needs at least {MIN_VOICE_SECONDS} seconds of recordings.")
    key = (vdir.parent.name, vdir.name)
    mtime = path.stat().st_mtime
    hit = conds_cache.get(key)
    if hit and hit[0] == mtime:
        return hit[1]
    conds = conditionals_class().load(path, map_location="cpu")
    if len(conds_cache) > 32:
        conds_cache.clear()
    conds_cache[key] = (mtime, conds)
    return conds


def split_text(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    sentences = re.split(r"(?<=[.!?।])\s+", text)
    chunks, cur = [], ""
    for s in sentences:
        while len(s) > CHUNK_CHARS:  # a very long sentence: split at a comma / space
            cut = max(s.rfind(", ", 0, CHUNK_CHARS), s.rfind("; ", 0, CHUNK_CHARS))
            cut = cut + 1 if cut > 60 else (s.rfind(" ", 0, CHUNK_CHARS) if s.rfind(" ", 0, CHUNK_CHARS) > 60 else CHUNK_CHARS)
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(s[:cut].strip())
            s = s[cut:].strip()
        if cur and len(cur) + 1 + len(s) > CHUNK_CHARS:
            chunks.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        chunks.append(cur)
    return [c for c in chunks if re.search(r"\w", c)]


def clamp_settings(s: dict) -> dict:
    out = {}
    for k, v in (s or {}).items():
        if k in DEFAULTS and isinstance(v, (int, float)):
            lo, hi = LIMITS[k]
            out[k] = float(min(hi, max(lo, v)))
    return out


# ---------------------------------------------------------------- routes
@app.get("/health")
def health():
    return {
        "ok": state["model"] is not None, "loading": state["loading"], "error": state["error"],
        "model": MODEL_KIND, "threads": THREADS, "busy": model_lock.locked(),
        "defaults": DEFAULTS, "limits": {k: LIMITS[k] for k in DEFAULTS}, "minSeconds": MIN_VOICE_SECONDS,
    }


@app.get("/voices", dependencies=[Depends(auth)])
def list_voices(owner: Path = Depends(owner_dir)):
    out = []
    for m in owner.glob("*/meta.json"):
        try:
            out.append(public(json.loads(m.read_text())))
        except Exception:
            continue
    return {"voices": sorted(out, key=lambda v: v["createdAt"], reverse=True)}


@app.post("/voices", dependencies=[Depends(auth)])
async def create_voice(name: str = Form(...), files: list[UploadFile] = File(...), owner: Path = Depends(owner_dir)):
    need_model()
    name = re.sub(r"[<>]", "", name).strip()[:80]
    if not name:
        raise HTTPException(400, "Give the voice a name.")
    vid = secrets.token_hex(6)
    vdir = owner / vid
    vdir.mkdir(parents=True)
    try:
        now = int(time.time() * 1000)
        meta = {"id": vid, "name": name, "createdAt": now, "samples": await save_uploads(vdir, files), "settings": {}}
        total = sum(s["seconds"] for s in meta["samples"])
        if total < MIN_VOICE_SECONDS:
            raise HTTPException(400, f"Only {total:.0f} s of speech was found — record at least {MIN_VOICE_SECONDS} seconds (30–60 s sounds best).")
        await run_in_threadpool(rebuild, vdir, meta)
        write_meta(vdir, meta)
        return public(meta)
    except BaseException:
        shutil.rmtree(vdir, ignore_errors=True)
        raise


@app.get("/voices/{vid}", dependencies=[Depends(auth)])
def get_voice(vid: str, owner: Path = Depends(owner_dir)):
    return public(read_meta(voice_dir(owner, vid)))


class VoicePatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    settings: Optional[dict] = None


@app.patch("/voices/{vid}", dependencies=[Depends(auth)])
def update_voice(vid: str, body: VoicePatch, owner: Path = Depends(owner_dir)):
    vdir = voice_dir(owner, vid)
    meta = read_meta(vdir)
    if body.name is not None and body.name.strip():
        meta["name"] = re.sub(r"[<>]", "", body.name).strip()[:80]
    if body.settings is not None:
        old_ex = meta.get("settings", {}).get("exaggeration")
        meta["settings"] = {**meta.get("settings", {}), **clamp_settings(body.settings)}
        # "Emotion" is baked into the standard model's voice → recompute it.
        if MODEL_KIND == "standard" and meta["settings"].get("exaggeration") != old_ex:
            rebuild(vdir, meta)
    write_meta(vdir, meta)
    return public(meta)


@app.delete("/voices/{vid}", dependencies=[Depends(auth)])
def delete_voice(vid: str, owner: Path = Depends(owner_dir)):
    vdir = voice_dir(owner, vid)
    shutil.rmtree(vdir, ignore_errors=True)
    conds_cache.pop((owner.name, vid), None)
    return {"ok": True}


@app.post("/voices/{vid}/samples", dependencies=[Depends(auth)])
async def add_samples(vid: str, files: list[UploadFile] = File(...), owner: Path = Depends(owner_dir)):
    vdir = voice_dir(owner, vid)
    meta = read_meta(vdir)
    meta["samples"] = meta.get("samples", []) + await save_uploads(vdir, files)
    await run_in_threadpool(rebuild, vdir, meta)
    write_meta(vdir, meta)
    return public(meta)


@app.get("/voices/{vid}/samples/{sid}", dependencies=[Depends(auth)])
def sample_audio(vid: str, sid: str, owner: Path = Depends(owner_dir)):
    vdir = voice_dir(owner, vid)
    if not re.fullmatch(r"[a-f0-9]{10}", sid or "") or not (vdir / "samples" / f"{sid}.wav").exists():
        raise HTTPException(404, "Recording not found.")
    return FileResponse(vdir / "samples" / f"{sid}.wav", media_type="audio/wav")


@app.delete("/voices/{vid}/samples/{sid}", dependencies=[Depends(auth)])
def delete_sample(vid: str, sid: str, owner: Path = Depends(owner_dir)):
    vdir = voice_dir(owner, vid)
    meta = read_meta(vdir)
    if not any(s["id"] == sid for s in meta.get("samples", [])):
        raise HTTPException(404, "Recording not found.")
    if len(meta["samples"]) == 1:
        raise HTTPException(400, "A voice needs at least one recording — delete the voice instead.")
    meta["samples"] = [s for s in meta["samples"] if s["id"] != sid]
    (vdir / "samples" / f"{sid}.wav").unlink(missing_ok=True)
    rebuild(vdir, meta)
    write_meta(vdir, meta)
    return public(meta)


class SpeechRequest(BaseModel):
    input: str = Field(..., max_length=MAX_TEXT)
    voice: str
    model: Optional[str] = None  # accepted for OpenAI compatibility (ignored)
    response_format: str = "mp3"
    speed: Optional[float] = None
    settings: Optional[dict] = None  # try settings without saving them


@app.post("/v1/audio/speech", dependencies=[Depends(auth)])
def speech(req: SpeechRequest, owner: Path = Depends(owner_dir)):
    import torch
    model = need_model()
    vdir = voice_dir(owner, req.voice)
    meta = read_meta(vdir)
    s = {**DEFAULTS, **meta.get("settings", {}), **clamp_settings(req.settings or {})}
    if req.speed:
        s["speed"] = float(min(1.25, max(0.8, req.speed)))
    chunks = split_text(req.input)
    if not chunks:
        raise HTTPException(400, "No text to read.")
    conds = load_conds(vdir)
    pause = np.zeros(int(s["pause_ms"] / 1000 * SR), dtype=np.float32)
    pieces = []
    t = time.time()
    with model_lock, torch.inference_mode():
        model.conds = conds
        for i, chunk in enumerate(chunks):
            if MODEL_KIND == "turbo":
                wav = model.generate(chunk, temperature=s["temperature"], top_p=s["top_p"], repetition_penalty=s["repetition_penalty"])
            else:
                wav = model.generate(chunk, exaggeration=s["exaggeration"], cfg_weight=s["cfg_weight"], temperature=s["temperature"])
            pieces.append(wav.squeeze(0).cpu().numpy().astype(np.float32))
            if i < len(chunks) - 1:
                pieces.append(pause)
    audio = np.concatenate(pieces)
    log.info("speech: %d chars, %d chunks → %.1fs audio in %.1fs", len(req.input), len(chunks), audio.size / model.sr, time.time() - t)
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        sf.write(tmp.name, audio, model.sr, subtype="PCM_16")
        filters = ["-af", f"atempo={s['speed']:.3f}"] if abs(s["speed"] - 1.0) > 0.01 else []
        if req.response_format == "wav":
            out = ffmpeg("-i", tmp.name, *filters, "-f", "wav", "pipe:1") if filters else Path(tmp.name).read_bytes()
            return Response(out, media_type="audio/wav")
        out = ffmpeg("-i", tmp.name, *filters, "-codec:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1")
    return Response(out, media_type="audio/mpeg")
