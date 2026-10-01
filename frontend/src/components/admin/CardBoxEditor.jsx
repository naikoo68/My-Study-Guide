// "Card position" for an uploaded slide template: how much of the template is
// kept FREE above (logo / title), below (website / icons) and at the sides —
// the white question / answer card fills the rest. Live preview on the real
// template. Saved as { top, bottom, side } fractions (backend utils/cardBox.js).
import { useState } from "react";
import { Loader2, Save, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";

// Same defaults as the backend (the old fixed card boxes).
const DEFAULT_CARD_BOX = {
  landscape: { top: 0.176, bottom: 0.139, side: 0.057 },
  portrait: { top: 0.156, bottom: 0.135, side: 0.046 },
};

const pct = (v) => Math.round(v * 100);

export default function CardBoxEditor({ templateUrl, boxKey, settings, saveSettings, landscape = false }) {
  const def = landscape ? DEFAULT_CARD_BOX.landscape : DEFAULT_CARD_BOX.portrait;
  const saved = settings?.[boxKey];
  const [box, setBox] = useState(() => (saved && typeof saved === "object" ? { ...def, ...saved } : def));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!templateUrl) return null;

  const set = (k, v) => {
    setMsg(null);
    setBox((b) => {
      const n = { ...b, [k]: Math.max(0, Math.min(k === "side" ? 0.3 : 0.45, v / 100)) };
      // Keep at least 30% of the height for the card.
      if (n.top + n.bottom > 0.7) n[k === "top" ? "bottom" : "top"] = Math.max(0, 0.7 - n[k]);
      return n;
    });
  };
  const save = async (value) => {
    setBusy(true); setMsg(null);
    try {
      await saveSettings({ [boxKey]: value });
      setMsg({ ok: true, text: value ? "Saved — new videos use this position." : "Reset to the default position." });
    } catch (e) { setMsg({ ok: false, text: e.message || "Could not save." }); } finally { setBusy(false); }
  };
  const reset = () => { setBox(def); save(null); };

  const slider = (k, label, max) => (
    <label className="block text-xs">
      <span className="flex justify-between font-medium"><span>{label}</span><span className="text-slate-400">{pct(box[k])}%</span></span>
      <input type="range" min={0} max={max} step={1} value={pct(box[k])} onChange={(e) => set(k, Number(e.target.value))} className="w-full accent-brand-600" />
    </label>
  );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-sm font-medium">Card position on this template</p>
      <p className="mt-0.5 text-xs text-slate-400">
        Drag the sliders until the white card (dashed box) no longer covers your logo at the top or the icons / text at the bottom.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className={`relative overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 ${landscape ? "" : "mx-auto max-w-[220px]"}`}>
          <img src={templateUrl} alt="" className="block w-full" />
          <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-rose-500 bg-white/85"
            style={{ top: `${box.top * 100}%`, bottom: `${box.bottom * 100}%`, left: `${box.side * 100}%`, right: `${box.side * 100}%` }}>
            <div className="flex h-full items-center justify-center text-[10px] font-semibold text-slate-500 sm:text-xs">Question card</div>
          </div>
        </div>
        <div className="space-y-3">
          {slider("top", "Space at the top", 45)}
          {slider("bottom", "Space at the bottom", 45)}
          {slider("side", "Space at the sides", 30)}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => save(box)} disabled={busy} className="btn-primary !py-1.5 !text-xs">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save position
            </button>
            <button type="button" onClick={reset} disabled={busy} className="btn-outline !py-1.5 !text-xs"><RotateCcw className="h-4 w-4" /> Default</button>
          </div>
          {msg && <p className={`inline-flex items-center gap-1 text-xs font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} {msg.text}</p>}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">Used for the question and answer slides. The text inside the card shrinks automatically to fit a smaller card.</p>
    </div>
  );
}
