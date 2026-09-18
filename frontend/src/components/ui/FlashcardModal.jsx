// Student-facing FLASHCARD viewer. Opened from the "Flashcard" button that
// appears once a question's answer is revealed. Shows the EXACT flashcard that
// the site renders for Facebook/Instagram auto-posts: the two-panel card
// (question | answer with Correct Answer + Explanation + Key Points + Quick
// Recall), on the admin's uploaded template when one is set, else the built-in
// design. Auto-scaled to fit the screen.
import { useRef, useState, useLayoutEffect } from "react";
import { X, GraduationCap, Download, Loader2 } from "lucide-react";
import { TemplateOverlay, BuiltInFlashcard } from "../../pages/FlashcardCardImage";
import { useSettings } from "../../context/SettingsContext";
import { captureNodeToBlob, downloadBlob } from "../../lib/questionImage";

// Scales a fixed-size flashcard down to fit `width` (never up), setting the
// wrapper height so it doesn't reserve the full un-scaled height.
function ScaledPreview({ width, children }) {
  const ref = useRef(null);
  const [dims, setDims] = useState({ scale: 1, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !width) return;
    const nw = el.offsetWidth || el.scrollWidth;
    const nh = el.offsetHeight || el.scrollHeight;
    if (!nw) return;
    const scale = Math.min(1, width / nw);
    const h = nh * scale;
    if (Math.abs(scale - dims.scale) > 0.004 || Math.abs(h - dims.h) > 1) setDims({ scale, h });
  });
  return (
    <div style={{ width, height: dims.h, overflow: "hidden" }}>
      <div ref={ref} style={{ transformOrigin: "top left", transform: `scale(${dims.scale})`, width: "max-content" }}>
        {children}
      </div>
    </div>
  );
}

export default function FlashcardModal({ q, onClose }) {
  const { settings } = useSettings();
  const boxRef = useRef(null);
  const captureRef = useRef(null); // off-screen FULL-SIZE flashcard, captured for Download
  const [w, setW] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [dlErr, setDlErr] = useState("");
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    let ro;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(el); }
    return () => ro?.disconnect();
  }, []);

  // Download the flashcard as a PNG — captured client-side (no login needed) at
  // FULL size from the off-screen copy, so it's crisp, not the scaled preview.
  const download = async () => {
    setDownloading(true); setDlErr("");
    try {
      const blob = await captureNodeToBlob(captureRef.current, { scale: 2 });
      downloadBlob(blob, `flashcard-${q?._id || "card"}.png`);
    } catch (e) {
      setDlErr(e.message || "Could not download the image.");
    } finally {
      setDownloading(false);
    }
  };

  if (!q) return null;

  // Same source of truth as the auto-post: use the uploaded template when set &
  // enabled, otherwise the built-in flashcard design.
  const tpl = settings?.fbFlashcardTemplateEnabled !== false && settings?.fbFlashcardTemplateUrl
    ? settings.fbFlashcardTemplateUrl
    : "";
  const card = tpl ? <TemplateOverlay q={q} tpl={tpl} onImg={() => {}} /> : <BuiltInFlashcard q={q} ready />;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-6 w-full max-w-3xl animate-scale-in rounded-2xl bg-white p-3 shadow-xl dark:bg-slate-900 sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
            <GraduationCap className="h-4 w-4" /> Flashcard
          </span>
          <div className="flex items-center gap-2">
            <button onClick={download} disabled={downloading} className="btn-outline !py-1.5 text-sm" title="Download this flashcard as an image">
              {downloading ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing…</> : <><Download className="h-4 w-4" /> Download</>}
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* The real flashcard (same renderer as the auto-post), scaled to fit. */}
        <div ref={boxRef} className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700">
          {w > 0 && <ScaledPreview width={w}>{card}</ScaledPreview>}
        </div>
        {dlErr && <p className="mt-2 text-center text-xs font-medium text-rose-600">{dlErr}</p>}

        {/* Off-screen FULL-SIZE copy used only for a crisp Download capture. */}
        <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none", opacity: 0 }}>
          <div ref={captureRef} style={{ background: "#ffffff", display: "inline-block" }}>{card}</div>
        </div>
      </div>
    </div>
  );
}
