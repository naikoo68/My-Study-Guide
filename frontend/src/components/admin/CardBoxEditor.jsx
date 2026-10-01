// "Card position" for an uploaded slide template: how much of the template is
// kept FREE above (logo / title), below (website / icons) and at the sides —
// the white question / answer card fills the rest. Live preview on the real
// template: drag the box's edges (or the box itself to move it up / down), or
// use the sliders and − / + buttons. Saved as { top, bottom, side } fractions
// (backend utils/cardBox.js).
import { useRef, useState } from "react";
import { Loader2, Save, RotateCcw, CheckCircle2, AlertTriangle, Minus, Plus, Move } from "lucide-react";

// Same defaults as the backend (the old fixed card boxes).
// card / text = opacity of the card's white background and of the quiz text.
const DEFAULT_CARD_BOX = {
  landscape: { top: 0.176, bottom: 0.139, side: 0.057, card: 0.94, text: 1 },
  portrait: { top: 0.156, bottom: 0.135, side: 0.046, card: 0.94, text: 1 },
};
const MAX = { top: 0.45, bottom: 0.45, side: 0.3, card: 1, text: 1 };
const MIN = { top: 0, bottom: 0, side: 0, card: 0, text: 0.1 }; // text never fully invisible
const STEPS = { card: 0.05, text: 0.05 }; // opacity − / + step (5%)
const MAX_TB = 0.7; // top + bottom — the card always keeps ≥ 30% of the height
const STEP = 0.005; // − / + step (0.5%)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const pctText = (v) => `${Math.round(v * 1000) / 10}%`;

// Set one side, keeping every limit (the OTHER of top / bottom gives way).
function withValue(b, k, v) {
  const n = { ...b, [k]: r3(clamp(v, MIN[k], MAX[k])) };
  if ((k === "top" || k === "bottom") && n.top + n.bottom > MAX_TB) {
    const other = k === "top" ? "bottom" : "top";
    n[other] = r3(Math.max(0, MAX_TB - n[k]));
  }
  return n;
}
// Move the whole card up / down (same height).
function moved(b, dy) {
  // Stop at the template's edges and at the 45% limits (instead of jumping back).
  const d = clamp(dy, Math.max(-b.top, b.bottom - MAX.bottom), Math.min(b.bottom, MAX.top - b.top));
  return { ...b, top: r3(b.top + d), bottom: r3(b.bottom - d) };
}

export default function CardBoxEditor({ templateUrl, boxKey, settings, saveSettings, landscape = false }) {
  const def = landscape ? DEFAULT_CARD_BOX.landscape : DEFAULT_CARD_BOX.portrait;
  const saved = settings?.[boxKey];
  const [box, setBox] = useState(() => (saved && typeof saved === "object" ? { ...def, ...saved } : def));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const frameRef = useRef(null);
  const drag = useRef(null); // { mode, startX, startY, start: box, w, h }
  if (!templateUrl) return null;

  const update = (fn) => { setMsg(null); setDirty(true); setBox(fn); };
  const setVal = (k, v) => update((b) => withValue(b, k, v));

  // ---- Dragging (mouse + touch via pointer events) ----
  // The handle's mode comes from its data-drag attribute (top / bottom / left / right / move).
  const onDown = (e) => {
    const mode = e.currentTarget.dataset.drag;
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: box, w: r.width, h: r.height };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.w, dy = (e.clientY - d.startY) / d.h;
    const s = d.start;
    let n = s;
    if (d.mode === "top") n = withValue(s, "top", s.top + dy);
    else if (d.mode === "bottom") n = withValue(s, "bottom", s.bottom - dy);
    else if (d.mode === "left") n = withValue(s, "side", s.side + dx);
    else if (d.mode === "right") n = withValue(s, "side", s.side - dx);
    else if (d.mode === "move") n = moved(s, dy);
    setMsg(null); setDirty(true); setBox(n);
  };
  const onUp = () => { drag.current = null; };

  const save = async (value) => {
    setBusy(true); setMsg(null);
    try {
      await saveSettings({ [boxKey]: value });
      setDirty(false);
      setMsg({ ok: true, text: value ? "Saved — new videos use this position." : "Reset to the default position." });
    } catch (e) { setMsg({ ok: false, text: e.message || "Could not save." }); } finally { setBusy(false); }
  };
  const reset = () => { setBox(def); save(null); };

  const row = (k, label, step = STEPS[k] || STEP) => (
    <div className="text-xs">
      <span className="flex justify-between font-medium"><span>{label}</span><span className="tabular-nums text-slate-400">{pctText(box[k])}</span></span>
      <div className="mt-1 flex items-center gap-1.5">
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} onClick={() => setVal(k, box[k] - step)} disabled={box[k] <= MIN[k]}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"><Minus className="h-3.5 w-3.5" /></button>
        <input type="range" min={MIN[k] * 1000} max={MAX[k] * 1000} step={5} value={Math.round(box[k] * 1000)} onChange={(e) => setVal(k, Number(e.target.value) / 1000)} className="w-full min-w-0 accent-brand-600" />
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => setVal(k, box[k] + step)} disabled={box[k] >= MAX[k]}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );

  // Edge handle: a wide invisible grab strip with a small visible pill.
  const handle = (mode, style, cursor, pill) => (
    <div data-drag={mode} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      className="absolute z-10 flex items-center justify-center" style={{ ...style, cursor, touchAction: "none" }} title="Drag">
      <span className={`rounded-full border-2 border-white bg-rose-500 shadow ${pill}`} />
    </div>
  );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-sm font-medium">Card position on this template</p>
      <p className="mt-0.5 text-xs text-slate-400">
        Drag the red handles on the dashed box (or drag the box to move it up / down), or use the − / + buttons, until the card no longer covers your logo at the top or the icons / text at the bottom.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div ref={frameRef} className={`relative select-none overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 ${landscape ? "" : "mx-auto max-w-[240px]"}`}>
          <img src={templateUrl} alt="" draggable={false} className="pointer-events-none block w-full" />
          <div className="absolute rounded-md border-2 border-dashed border-rose-500"
            style={{ top: `${box.top * 100}%`, bottom: `${box.bottom * 100}%`, left: `${box.side * 100}%`, right: `${box.side * 100}%`, backgroundColor: `rgba(255,255,255,${box.card})` }}>
            {/* Middle: move up / down */}
            <div data-drag="move" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              className="absolute inset-3 flex cursor-move flex-col items-center justify-center gap-1 text-[10px] font-semibold text-slate-500 sm:text-xs" style={{ touchAction: "none" }}>
              <Move className="h-4 w-4" />
              {/* Sample quiz text at the chosen text opacity */}
              <span className="text-center text-xs font-bold text-slate-900 sm:text-sm" style={{ opacity: box.text }}>Sample question text?</span>
              <span className="w-2/3 max-w-[220px] rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-700 sm:text-xs" style={{ opacity: box.text }}>A&nbsp; Option one</span>
            </div>
            {handle("top", { left: 0, right: 0, top: -12, height: 24 }, "ns-resize", "h-2.5 w-10")}
            {handle("bottom", { left: 0, right: 0, bottom: -12, height: 24 }, "ns-resize", "h-2.5 w-10")}
            {handle("left", { top: 0, bottom: 0, left: -12, width: 24 }, "ew-resize", "h-10 w-2.5")}
            {handle("right", { top: 0, bottom: 0, right: -12, width: 24 }, "ew-resize", "h-10 w-2.5")}
          </div>
        </div>
        <div className="space-y-3">
          {row("top", "Space at the top")}
          {row("bottom", "Space at the bottom")}
          {row("side", "Space at the sides")}
          <div className="border-t border-slate-200 pt-2 dark:border-slate-700" />
          {row("card", "Card opacity")}
          {row("text", "Text opacity")}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => save(box)} disabled={busy} className="btn-primary !py-1.5 !text-xs">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save position
            </button>
            <button type="button" onClick={reset} disabled={busy} className="btn-outline !py-1.5 !text-xs"><RotateCcw className="h-4 w-4" /> Default</button>
          </div>
          {dirty && !msg && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Not saved yet — tap Save position.</p>}
          {msg && <p className={`inline-flex items-center gap-1 text-xs font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} {msg.text}</p>}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">Used for the question and answer slides. <b>Card opacity</b> = the white card behind the text (0% = fully see-through, your template shows behind the text). <b>Text opacity</b> = the question, options and explanation (at least 10%). The left and right sides move together so the card stays centred. The text inside the card shrinks automatically to fit a smaller card.</p>
    </div>
  );
}
