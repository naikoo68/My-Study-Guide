// Shared pieces of the Voice Studio: the microphone recorder (with a live level
// meter, pause, and file upload), the list of takes, and audio players.
import { useEffect, useRef, useState } from "react";
import { fmtSecs, totalSecs, makeTake } from "./utils";
import { Mic, Square, Pause, Play, Upload, Trash2, Download, Loader2, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

// Best format this browser can record (Chrome/Firefox → webm, Safari → mp4).
function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}
const extFor = (mime) => (/mp4/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm");

// Length of an uploaded audio file (best effort).
function fileDuration(file) {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const done = (v) => { URL.revokeObjectURL(url); resolve(Number.isFinite(v) ? v : 0); };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 5000);
    a.src = url;
  });
}

// Microphone recorder + uploader. Calls onAdd(take) for every finished take.
// `single` = only one take is kept (the parent replaces it).
export function Recorder({ onAdd, scripts = null, single = false, hint = "", disabled = false }) {
  const [state, setState] = useState("idle"); // idle | recording | paused
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [warn, setWarn] = useState("");
  const [error, setError] = useState("");
  const [scriptIdx, setScriptIdx] = useState(0);
  const rec = useRef(null); // { mr, stream, ctx, raf, chunks, startedAt, pausedMs, pausedAt, peaks, quiet, frames }
  const fileRef = useRef(null);
  const count = useRef(0);

  const cleanup = () => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    clearInterval(r.timer);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close?.().catch(() => {});
    rec.current = null;
  };
  useEffect(() => cleanup, []);

  const secondsNow = () => {
    const r = rec.current;
    if (!r) return 0;
    const pausedNow = r.pausedAt ? performance.now() - r.pausedAt : 0;
    return (performance.now() - r.startedAt - r.pausedMs - pausedNow) / 1000;
  };

  const start = async () => {
    setError(""); setWarn("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. Use Chrome, Edge or Safari — or upload a recording instead.");
      return;
    }
    let stream;
    try {
      // Echo cancellation helps on a phone/laptop speaker; heavy noise
      // suppression is left off because it makes a clone sound "underwater".
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
    } catch (e) {
      setError(e?.name === "NotAllowedError" ? "Microphone permission was denied. Allow the microphone for this site in the browser settings, then try again." : `Could not open the microphone: ${e?.message || e}`);
      return;
    }
    const mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const r = { mr, stream, chunks, startedAt: performance.now(), pausedMs: 0, pausedAt: 0, peaks: 0, quiet: 0, frames: 0 };
    rec.current = r;
    mr.onstop = () => {
      const type = mr.mimeType || mime || "audio/webm";
      const secs = secondsNow();
      const { peaks, quiet, frames } = r;
      cleanup();
      setState("idle"); setLevel(0); setElapsed(0);
      if (secs < 1.5 || !chunks.length) { setWarn("That take was too short — it wasn't kept."); return; }
      count.current += 1;
      const file = new File([new Blob(chunks, { type })], `Recording ${count.current}.${extFor(type)}`, { type: type.split(";")[0] });
      onAdd(makeTake(file, secs, "mic"));
      if (frames && peaks / frames > 0.02) setWarn("Some parts were too loud (clipping). Move the phone a little further from your mouth.");
      else if (frames && quiet / frames > 0.85) setWarn("That take was very quiet. Move closer to the microphone or speak a little louder.");
    };
    // Live level meter (and loud / quiet checks).
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      r.ctx = ctx;
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let sum = 0, peak = 0;
        for (const v of buf) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
        const rms = Math.sqrt(sum / buf.length);
        if (!r.pausedAt) { r.frames += 1; if (peak > 0.98) r.peaks += 1; if (rms < 0.01) r.quiet += 1; }
        setLevel(Math.min(1, rms * 6));
        r.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* the meter is optional */ }
    r.timer = setInterval(() => setElapsed(secondsNow()), 250);
    mr.start(1000);
    setState("recording");
  };
  const pause = () => {
    const r = rec.current;
    if (!r) return;
    if (state === "recording") { r.mr.pause(); r.pausedAt = performance.now(); setState("paused"); }
    else { r.mr.resume(); r.pausedMs += performance.now() - r.pausedAt; r.pausedAt = 0; setState("recording"); }
  };
  const stop = () => rec.current?.mr.state !== "inactive" && rec.current?.mr.stop();

  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    for (const f of single ? files.slice(0, 1) : files) onAdd(makeTake(f, await fileDuration(f), "upload"));
  };

  const live = state !== "idle";
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      {scripts && (
        <div className="mb-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Read this aloud ({scriptIdx + 1}/{scripts.length}) — or say anything in your normal teaching style</span>
            <button type="button" onClick={() => setScriptIdx((i) => (i + 1) % scripts.length)} className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline">Next text <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
          <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{scripts[scriptIdx]}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!live ? (
          <button type="button" onClick={start} disabled={disabled} className="btn-primary !py-2"><Mic className="h-4 w-4" /> Record</button>
        ) : (
          <>
            <button type="button" onClick={stop} className="btn-primary !bg-rose-600 !py-2 hover:!bg-rose-700"><Square className="h-4 w-4" /> Stop &amp; keep</button>
            <button type="button" onClick={pause} className="btn-outline !py-2">{state === "paused" ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}</button>
          </>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={live || disabled} className="btn-outline !py-2"><Upload className="h-4 w-4" /> Upload audio</button>
        <input ref={fileRef} type="file" accept="audio/*,video/webm,video/mp4,.m4a,.mp3,.wav,.ogg,.webm,.flac" multiple={!single} className="hidden" onChange={upload} />
        {live && (
          <div className="flex min-w-[10rem] flex-1 items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${state === "recording" ? "animate-pulse bg-rose-500" : "bg-amber-400"}`} />
            <span className="w-12 font-mono text-sm tabular-nums">{fmtSecs(elapsed)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" title="Microphone level">
              <div className={`h-full transition-[width] duration-75 ${level > 0.9 ? "bg-rose-500" : level > 0.15 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          </div>
        )}
      </div>
      {hint && !live && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {warn && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> {warn}</p>}
      {error && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-600"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}
    </div>
  );
}

// The list of kept recordings (play / remove), with the total length.
export function TakeList({ takes, onRemove, target = 0 }) {
  if (!takes.length) return null;
  const total = totalSecs(takes);
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{takes.length} recording{takes.length > 1 ? "s" : ""} · total <b className="text-slate-700 dark:text-slate-200">{fmtSecs(total)}</b>{target ? <> of {fmtSecs(target)} recommended</> : null}</span>
      </div>
      {target > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className={`h-full ${total >= target ? "bg-emerald-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, (total / target) * 100)}%` }} />
        </div>
      )}
      <ul className="space-y-1.5">
        {takes.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700">
            <span className="min-w-0 flex-1 truncate text-sm">{t.name} <span className="text-xs text-slate-400">· {t.seconds ? fmtSecs(t.seconds) : "?"}</span></span>
            <audio src={t.url} controls preload="none" className="h-8 w-full max-w-[16rem]" />
            <button type="button" onClick={() => onRemove(t.id)} title="Remove" className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A result audio with a Download button.
export function AudioResult({ src, name = "audio.mp3", label = "" }) {
  if (!src) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-2 dark:bg-emerald-900/20">
      {label && <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{label}</span>}
      <audio src={src} controls autoPlay className="h-9 w-full max-w-md" />
      <a href={src} download={name} className="btn-outline !py-1.5 !text-xs"><Download className="h-4 w-4" /> Download</a>
    </div>
  );
}

export function Msg({ msg }) {
  if (!msg) return null;
  return (
    <p className={`mt-2 flex items-start gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
      {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />} <span>{msg.text}</span>
    </p>
  );
}

export function Spin({ on, children }) {
  return on ? <Loader2 className="h-4 w-4 animate-spin" /> : children;
}
