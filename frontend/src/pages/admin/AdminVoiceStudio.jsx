// Voice Studio — record your own voice, make a clone of it on YOUR OWN voice
// server (no outside company), test and tune it, and narrate every video with it.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AudioLines, Server, CheckCircle2, AlertTriangle, Loader2, Mic, Play, Trash2, Star, SlidersHorizontal,
  ListMusic, Pencil, RefreshCw, ShieldCheck, Sparkles, Plus,
} from "lucide-react";
import { voiceStudioService } from "../../services";
import { useSettings } from "../../context/SettingsContext";
import { Recorder, TakeList, AudioResult, Msg, Spin } from "../../components/admin/voiceStudio/shared";
import { fmtSecs, totalSecs, READING_SCRIPTS } from "../../components/admin/voiceStudio/utils";

const TARGET_SECS = 60; // 30–60 s of clean speech is the sweet spot
const TEST_TEXT = "Question one. Which article of the Constitution of India deals with the Right to Equality? Option A, Article fourteen. Option B, Article nineteen. The correct answer is option A.";

// Friendly names for the voice server's settings.
const SETTING_INFO = {
  speed: { label: "Speed", hint: "1.0 = your normal pace", step: 0.01, fmt: (v) => `${v.toFixed(2)}×` },
  pause_ms: { label: "Pause between sentences", hint: "silence after each sentence", step: 50, fmt: (v) => `${Math.round(v)} ms` },
  exaggeration: { label: "Emotion", hint: "higher = more expressive", step: 0.05, fmt: (v) => v.toFixed(2) },
  cfg_weight: { label: "Pace control", hint: "lower = slower, more careful delivery", step: 0.05, fmt: (v) => v.toFixed(2) },
  temperature: { label: "Variation", hint: "lower = steadier, higher = livelier", step: 0.05, fmt: (v) => v.toFixed(2) },
  top_p: { label: "Word choice range", hint: "advanced", step: 0.01, fmt: (v) => v.toFixed(2), advanced: true },
  repetition_penalty: { label: "Repetition guard", hint: "advanced", step: 0.05, fmt: (v) => v.toFixed(2), advanced: true },
};

export default function AdminVoiceStudio() {
  const { reload: reloadSettings } = useSettings();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => voiceStudioService.status()
    .catch((e) => ({ configured: false, error: e.message, voices: [] }))
    .then((s) => { setStatus(s); setLoading(false); }), []);
  useEffect(() => {
    voiceStudioService.status()
      .catch((e) => ({ configured: false, error: e.message, voices: [] }))
      .then((s) => { setStatus(s); setLoading(false); });
  }, []);
  // While the model is still loading (first start), check again every 15 s.
  useEffect(() => {
    if (!status?.server?.loading) return undefined;
    const t = setTimeout(load, 15000);
    return () => clearTimeout(t);
  }, [status, load]);

  const ready = !!status?.server?.ok;
  const voices = status?.voices || [];
  const narratorId = status?.narrator?.provider === "myvoice" ? status.narrator.voice : "";

  const makeNarrator = async (v) => {
    setMsg(null);
    try {
      await voiceStudioService.useAsNarrator(v.id);
      await reloadSettings?.();
      await load();
      setMsg({ ok: true, text: `“${v.name}” now narrates every video, Short and slideshow.` });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><AudioLines className="h-6 w-6 text-brand-600" /> Voice Studio</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Record your own voice once — your videos are then narrated in <b>your voice and accent</b>. It runs on your own server:
          your recordings never go to any outside company.
        </p>
      </div>

      <ServerCard status={status} loading={loading} onRefresh={() => { setLoading(true); load(); }} />

      {ready && (
        <>
          <CreateVoice onCreated={async (v) => { await load(); setMsg({ ok: true, text: `“${v.name}” is ready — test it below, then tap “Use as narrator”.` }); }} />
          <section className="card p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ListMusic className="h-5 w-5 text-slate-400" /> My voices</h2>
            <Msg msg={msg} />
            {!voices.length ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No voice yet — record one above.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {voices.map((v) => (
                  <VoiceCard key={v.id} voice={v} server={status.server} isNarrator={v.id === narratorId}
                    onNarrator={() => makeNarrator(v)} onChange={load}
                    onDeleted={async (r) => { if (r?.narratorReset) await reloadSettings?.(); await load(); setMsg({ ok: true, text: r?.narratorReset ? "Deleted. Videos are narrated by the free Indian voice again." : "Deleted." }); }} />
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-slate-400">
              You can also choose your voice under <Link to="/admin/facebook" className="text-brand-600 hover:underline">Social Media Auto Posting</Link> → Narration engine → “My own voice”.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- server status
function ServerCard({ status, loading, onRefresh }) {
  if (loading && !status) return <div className="card flex items-center gap-2 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Checking your voice server…</div>;
  const s = status?.server;
  let tone = "rose", title = "Your voice server isn't set up yet", body;
  if (s?.ok) {
    tone = "emerald"; title = "Your voice server is running";
    body = <>Model: <b>{s.model === "turbo" ? "Chatterbox Turbo (fast)" : "Chatterbox (with emotion control)"}</b> · {s.threads} CPU cores{s.busy ? " · busy making audio right now" : ""}. On a CPU, one minute of speech takes roughly 1–3 minutes to make, so long videos take a while — they run in the background.</>;
  } else if (s?.loading) {
    tone = "amber"; title = "Your voice server is starting";
    body = "The first start downloads the voice model (about 2 GB). This page checks again every 15 seconds.";
  } else if (status?.configured) {
    title = "Can't use your voice server";
    body = status?.error || s?.error || "Unknown error.";
  } else {
    body = (
      <ol className="ml-4 list-decimal space-y-1">
        <li>Your Oracle VM needs at least <b>8 GB of RAM</b> (Oracle Always Free “Ampere A1” gives up to 24 GB free).</li>
        <li>On GitHub, open <b>Actions → “Deploy voice server to Oracle VM” → Run workflow</b>. It installs everything, links it to the backend, and restarts the backend.</li>
        <li>Wait for it to finish (the first time takes 10–30 minutes), then come back and refresh this page.</li>
      </ol>
    );
  }
  const colors = {
    emerald: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20",
    rose: "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-900/20",
  };
  const Icon = tone === "emerald" ? CheckCircle2 : tone === "amber" ? Loader2 : AlertTriangle;
  return (
    <section className={`rounded-xl border p-4 ${colors[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><Server className="h-5 w-5" /> {title} <Icon className={`h-4 w-4 ${tone === "amber" ? "animate-spin" : ""}`} /></h2>
        <button type="button" onClick={onRefresh} className="btn-ghost !p-1.5" title="Check again"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>
      {body && <div className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">{body}</div>}
    </section>
  );
}

// ---------------------------------------------------------------- create
function CreateVoice({ onCreated }) {
  const [name, setName] = useState("My voice");
  const [takes, setTakes] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const total = totalSecs(takes);
  // Free the recordings' memory when leaving the page.
  const takesRef = useRef(takes);
  useEffect(() => { takesRef.current = takes; }, [takes]);
  useEffect(() => () => takesRef.current.forEach((t) => URL.revokeObjectURL(t.url)), []);

  const create = async () => {
    setBusy(true); setMsg(null);
    try {
      const v = await voiceStudioService.create(name.trim(), takes);
      takes.forEach((t) => URL.revokeObjectURL(t.url));
      setTakes([]); setConsent(false);
      await onCreated(v);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Mic className="h-5 w-5 text-slate-400" /> Create your voice</h2>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-500 dark:text-slate-400">
        <li>Record <b>30–60 seconds</b> in total (one long take or a few short ones). Minimum 6 seconds.</li>
        <li>Quiet room, no fan or music, phone about a hand-width from your mouth.</li>
        <li>Speak exactly the way you want your videos to sound — your accent and style are copied.</li>
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium" htmlFor="vs-name">Voice name</label>
        <input id="vs-name" className="input h-9 w-56" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="mt-3">
        <Recorder scripts={READING_SCRIPTS} onAdd={(t) => setTakes((x) => [...x, t])} disabled={busy}
          hint="Tip: read the text above in your normal teaching voice. Long pauses are cut out automatically." />
        <TakeList takes={takes} target={TARGET_SECS} onRemove={(id) => setTakes((x) => { const t = x.find((y) => y.id === id); if (t) URL.revokeObjectURL(t.url); return x.filter((y) => y.id !== id); })} />
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span><ShieldCheck className="mr-1 inline h-4 w-4 text-slate-400" />This is <b>my own voice</b>, or I have the speaker's permission to clone it.</span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={create} disabled={busy || !consent || !name.trim() || total < 6} className="btn-primary">
          <Spin on={busy}><Sparkles className="h-4 w-4" /></Spin> {busy ? "Making your voice…" : "Create my voice"}
        </button>
        {takes.length > 0 && total < 30 && <span className="text-xs text-amber-600 dark:text-amber-400">{total < 6 ? `Record at least ${Math.ceil(6 - total)} more seconds.` : "Works now — 30 s or more sounds closer to you."}</span>}
      </div>
      <Msg msg={msg} />
    </section>
  );
}

// ---------------------------------------------------------------- one voice
function VoiceCard({ voice, server, isNarrator, onNarrator, onChange, onDeleted }) {
  const [panel, setPanel] = useState(""); // test | settings | recordings | rename
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const toggle = (p) => { setPanel((x) => (x === p ? "" : p)); setMsg(null); };

  const remove = async () => {
    if (!window.confirm(`Delete the voice “${voice.name}” and its recordings? This can't be undone.`)) return;
    setBusy(true);
    try { onDeleted(await voiceStudioService.remove(voice.id)); }
    catch (e) { setMsg({ ok: false, text: e.message }); setBusy(false); }
  };

  return (
    <div className={`rounded-xl border p-3 ${isNarrator ? "border-brand-400 dark:border-brand-600" : "border-slate-200 dark:border-slate-700"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {voice.name}
            {isNarrator && <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><Star className="mr-1 h-3 w-3" /> Narrator</span>}
            {!voice.ready && <span className="badge bg-amber-100 text-amber-700">needs more audio</span>}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{voice.samples.length} recording{voice.samples.length === 1 ? "" : "s"} · {fmtSecs(voice.seconds)} of speech</p>
        </div>
        {!isNarrator && voice.ready && <button type="button" onClick={onNarrator} className="btn-primary !py-1.5 !text-xs"><Star className="h-4 w-4" /> Use as narrator</button>}
        <button type="button" onClick={() => toggle("test")} className="btn-outline !py-1.5 !text-xs"><Play className="h-4 w-4" /> Test</button>
        <button type="button" onClick={() => toggle("settings")} className="btn-outline !py-1.5 !text-xs"><SlidersHorizontal className="h-4 w-4" /> Settings</button>
        <button type="button" onClick={() => toggle("recordings")} className="btn-outline !py-1.5 !text-xs"><ListMusic className="h-4 w-4" /> Recordings</button>
        <button type="button" onClick={() => toggle("rename")} className="btn-ghost !p-1.5" title="Rename"><Pencil className="h-4 w-4" /></button>
        <button type="button" onClick={remove} disabled={busy} className="btn-ghost !p-1.5 text-rose-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
      </div>
      <Msg msg={msg} />
      {panel === "test" && <TestPanel voice={voice} />}
      {panel === "settings" && <SettingsPanel voice={voice} server={server} onSaved={onChange} />}
      {panel === "recordings" && <RecordingsPanel voice={voice} onChange={onChange} />}
      {panel === "rename" && <RenamePanel voice={voice} onSaved={() => { setPanel(""); onChange(); }} />}
    </div>
  );
}

// A clock that ticks every half second while `on` (for "Speaking… 12 s").
function useNow(on) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

function TestPanel({ voice, settings = null }) {
  const [text, setText] = useState(TEST_TEXT);
  const [audio, setAudio] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [startedAt, setStartedAt] = useState(0);
  const now = useNow(busy);
  const elapsed = busy ? Math.max(0, (now - startedAt) / 1000) : 0;
  const run = async () => {
    setStartedAt(Date.now()); setBusy(true); setMsg(null); setAudio("");
    try {
      const r = await voiceStudioService.speak(voice.id, text, settings);
      setAudio(r.audio);
      setMsg({ ok: true, text: `Made in ${Math.round(r.seconds)} s.` });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <textarea className="input min-h-[80px] w-full" maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={run} disabled={busy || !text.trim()} className="btn-primary !py-1.5 !text-xs">
          <Spin on={busy}><Play className="h-4 w-4" /></Spin> {busy ? `Speaking… ${Math.round(elapsed)} s` : settings ? "Hear with these settings" : "Hear it in this voice"}
        </button>
        <span className="text-xs text-slate-400">{text.length}/1500</span>
      </div>
      <Msg msg={msg} />
      <AudioResult src={audio} name={`${voice.name}.mp3`} />
    </div>
  );
}

function SettingsPanel({ voice, server, onSaved }) {
  const defaults = server?.defaults || {};
  const limits = server?.limits || {};
  const [s, setS] = useState({ ...defaults, ...voice.settings });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const keys = Object.keys(defaults).filter((k) => SETTING_INFO[k] && limits[k] && (advanced || !SETTING_INFO[k].advanced));
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await voiceStudioService.update(voice.id, { settings: s }); setMsg({ ok: true, text: "Saved — every narration in this voice uses these settings." }); onSaved(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="grid gap-3 sm:grid-cols-2">
        {keys.map((k) => {
          const info = SETTING_INFO[k];
          const [lo, hi] = limits[k];
          return (
            <label key={k} className="block text-xs">
              <span className="flex justify-between font-medium"><span>{info.label}</span><span className="tabular-nums text-slate-500">{info.fmt(Number(s[k]))}</span></span>
              <input type="range" min={lo} max={hi} step={info.step} value={s[k]} onChange={(e) => setS((x) => ({ ...x, [k]: Number(e.target.value) }))} className="w-full accent-brand-600" />
              <span className="text-slate-400">{info.hint}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="btn-primary !py-1.5 !text-xs"><Spin on={busy}><CheckCircle2 className="h-4 w-4" /></Spin> Save settings</button>
        <button type="button" onClick={() => setS({ ...defaults })} className="btn-outline !py-1.5 !text-xs">Defaults</button>
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-xs text-brand-600 hover:underline">{advanced ? "Hide advanced" : "Advanced"}</button>
      </div>
      <Msg msg={msg} />
      <TestPanel voice={voice} settings={s} />
    </div>
  );
}

function RecordingsPanel({ voice, onChange }) {
  const [playing, setPlaying] = useState({}); // sampleId → data url
  const [loadingId, setLoadingId] = useState("");
  const [takes, setTakes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const play = async (sid) => {
    setLoadingId(sid);
    try { const r = await voiceStudioService.sampleAudio(voice.id, sid); setPlaying((p) => ({ ...p, [sid]: r.audio })); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setLoadingId(""); }
  };
  const removeSample = async (sid) => {
    if (!window.confirm("Remove this recording from the voice?")) return;
    setBusy(true); setMsg(null);
    try { await voiceStudioService.removeSample(voice.id, sid); onChange(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  const add = async () => {
    setBusy(true); setMsg(null);
    try {
      await voiceStudioService.addSamples(voice.id, takes);
      takes.forEach((t) => URL.revokeObjectURL(t.url));
      setTakes([]);
      setMsg({ ok: true, text: "Added — the voice was updated with the new recordings." });
      onChange();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <p className="text-xs text-slate-500 dark:text-slate-400">The voice is learned from the first 60 seconds of these (silences removed). Remove a take that has noise, coughs or mistakes.</p>
      <ul className="mt-2 space-y-1.5">
        {voice.samples.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
            <span className="min-w-0 flex-1 truncate text-sm">{s.name} <span className="text-xs text-slate-400">· {fmtSecs(s.seconds)}</span></span>
            {playing[s.id] ? <audio src={playing[s.id]} controls autoPlay className="h-8 w-full max-w-[16rem]" />
              : <button type="button" onClick={() => play(s.id)} className="btn-outline !py-1 !text-xs"><Spin on={loadingId === s.id}><Play className="h-3.5 w-3.5" /></Spin> Play</button>}
            {voice.samples.length > 1 && <button type="button" onClick={() => removeSample(s.id)} disabled={busy} title="Remove" className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>}
          </li>
        ))}
      </ul>
      <p className="mb-2 mt-3 text-sm font-medium">Add more recordings</p>
      <Recorder scripts={READING_SCRIPTS} onAdd={(t) => setTakes((x) => [...x, t])} disabled={busy} />
      <TakeList takes={takes} onRemove={(id) => setTakes((x) => x.filter((y) => y.id !== id))} />
      {takes.length > 0 && <button type="button" onClick={add} disabled={busy} className="btn-primary mt-2 !py-1.5 !text-xs"><Spin on={busy}><Plus className="h-4 w-4" /></Spin> Add to this voice</button>}
      <Msg msg={msg} />
    </div>
  );
}

function RenamePanel({ voice, onSaved }) {
  const [name, setName] = useState(voice.name);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await voiceStudioService.update(voice.id, { name: name.trim() }); onSaved(); }
    catch (e) { setMsg({ ok: false, text: e.message }); setBusy(false); }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input className="input h-9 w-60" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <button type="button" onClick={save} disabled={busy || !name.trim()} className="btn-primary !py-1.5 !text-xs"><Spin on={busy}><CheckCircle2 className="h-4 w-4" /></Spin> Save name</button>
      <Msg msg={msg} />
    </div>
  );
}
