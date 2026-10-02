// "Preview" next to a narrator voice picker: speaks a short quiz line in the
// chosen engine + voice, exactly as a video would (same server path, same
// fallback when an engine is blocked), so the admin can hear it before saving.
import { useEffect, useRef, useState } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { youtubeService } from "../../services";

export const PREVIEW_LINE = "Question one. Which article of the Constitution of India deals with the Right to Equality? Option A, Article fourteen. The correct answer is option A.";

export default function VoicePreviewButton({ engine = "", voice = "", text = PREVIEW_LINE, className = "" }) {
  const [state, setState] = useState("idle"); // idle | loading | playing
  const [note, setNote] = useState(null); // { ok, text }
  const audio = useRef(null);
  const cache = useRef(new Map()); // `${engine}|${voice}` → data url (replay is instant)
  const req = useRef(0);

  const stop = () => { audio.current?.pause(); audio.current = null; setState("idle"); };
  useEffect(() => () => audio.current?.pause(), []);
  // A different voice picked → stop the old one and clear its message.
  const key = `${engine}|${voice}`;
  const [shownFor, setShownFor] = useState(key);
  if (shownFor !== key) { setShownFor(key); setState("idle"); setNote(null); }
  useEffect(() => { req.current += 1; audio.current?.pause(); audio.current = null; }, [key]);

  const play = async () => {
    if (state === "playing") { stop(); return; }
    const id = ++req.current;
    setNote(null);
    let src = cache.current.get(key);
    if (!src) {
      setState("loading");
      try {
        const r = await youtubeService.narrationPreview({ role: "intro", text, engine, voice });
        if (id !== req.current) return;
        src = r.audio;
        cache.current.set(key, src);
        if (r.note) setNote({ ok: false, text: r.note });
      } catch (e) {
        if (id !== req.current) return;
        setState("idle");
        setNote({ ok: false, text: e.message || "Couldn't make the preview." });
        return;
      }
    }
    const a = new Audio(src);
    audio.current = a;
    a.onended = () => { if (audio.current === a) { audio.current = null; setState("idle"); } };
    setState("playing");
    a.play().catch(() => { setState("idle"); setNote({ ok: false, text: "The browser blocked playback — tap Preview again." }); });
  };

  return (
    <span className={`inline-flex flex-col gap-0.5 ${className}`}>
      <button type="button" onClick={play} disabled={state === "loading"} title="Hear this voice"
        className="btn-outline inline-flex h-9 items-center gap-1 whitespace-nowrap !px-2.5 !py-1 !text-xs">
        {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "playing" ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-4 w-4" />}
        {state === "loading" ? "Making…" : state === "playing" ? "Stop" : "Preview"}
      </button>
      {note && <span className={`max-w-[16rem] text-[11px] ${note.ok ? "text-emerald-600" : "text-amber-600 dark:text-amber-400"}`}>{note.text}</span>}
    </span>
  );
}
