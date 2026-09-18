// Chrome-less flashcard for ONE question, screenshotted by the backend (cardShot)
// to produce a single combined social image for the "Flashcard" auto-post type.
//
// Two render modes:
//  • DEFAULT (no ?tpl): a built-in two-panel branded flashcard (question | answer).
//  • TEMPLATE (?tpl=<image url>): the admin's uploaded template image is the
//    background (its header/footer branding), and the SAME content is rendered
//    into the two empty middle REGIONS, auto-scaled to fit. Because it renders
//    the real content components (not fixed boxes), it works for EVERY question
//    type (matching, assertion, statement, table, diagram…) and never overflows.
//
// Always fetches WITH the answer so the answer side can render. Sets
// data-card-ready="1" once the question + web fonts (+ template image) load.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { GraduationCap, BookOpenCheck, CheckCircle2, Eye } from "lucide-react";
import { contentService } from "../services";
import Badge from "../components/ui/Badge";
import MathText from "../components/ui/MathText";
import OptionContent from "../components/ui/OptionContent";
import StatementPairView from "../components/ui/StatementPairView";
import TableView from "../components/ui/TableView";
import GraphView from "../components/ui/GraphView";
import VizView from "../components/ui/VizView";
import AssertionReasonView from "../components/ui/AssertionReasonView";
import FlashcardAnswer from "../components/ui/FlashcardAnswer";
import { stemText, displayOptions } from "../lib/questions";

const optionLabels = ["A", "B", "C", "D", "E", "F"];
const pill = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
function toRoman(num) {
  const map = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
  let r = "";
  for (const [s, v] of map) while (num >= v) { r += s; num -= v; }
  return r;
}
const subjectOf = (q) => q.subjectName || q.topic || "";

// ---- Shared panel content (used by BOTH the built-in card and the template
//      overlay). No header/footer here — those come from the card frame / the
//      uploaded template image. -----------------------------------------------
function FrontContent({ q }) {
  const isMatching = q?.type === "matching";
  const subj = subjectOf(q);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {subj && <span className={`${pill} bg-emerald-50 text-emerald-700`}>{subj}</span>}
        <Badge variant={q.difficulty}>{q.difficulty}</Badge>
      </div>
      <h2 className="text-lg font-bold leading-relaxed"><MathText>{stemText(q)}</MathText></h2>
      {isMatching && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">Column A</p>
            <div className="space-y-1.5">{(q.columnA || []).map((item, i) => (<div key={i} className="flex items-start gap-1.5 text-xs"><span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-brand-100 text-[10px] font-bold text-brand-700">{i + 1}</span><MathText>{item}</MathText></div>))}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-600">Column B</p>
            <div className="space-y-1.5">{(q.columnB || []).map((item, i) => (<div key={i} className="flex items-start gap-1.5 text-xs"><span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-accent-100 text-[10px] font-bold text-accent-700">{toRoman(i + 1)}</span><MathText>{item}</MathText></div>))}</div>
          </div>
        </div>
      )}
      <StatementPairView q={q} /><TableView q={q} /><GraphView q={q} /><VizView q={q} /><AssertionReasonView q={q} />
      <div className="mt-3 space-y-2">
        {isMatching && <p className="text-xs font-medium text-slate-500">Choose the correct matching sequence:</p>}
        {displayOptions(q).map((opt, idx) => (
          <div key={idx} className="flex w-full items-center gap-2.5 rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-left text-sm">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-slate-300 text-xs font-bold">{isMatching ? `(${String.fromCharCode(97 + idx)})` : optionLabels[idx]}</span>
            <span className="flex-1"><OptionContent>{opt}</OptionContent></span>
          </div>
        ))}
      </div>
    </>
  );
}

function BackContent({ q }) {
  const subj = subjectOf(q);
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {subj && <span className={`${pill} bg-emerald-50 text-emerald-700`}>{subj}</span>}
        <Badge variant={q.difficulty}>{q.difficulty}</Badge>
      </div>
      <FlashcardAnswer q={q} />
    </>
  );
}

// ---- TEMPLATE OVERLAY: content rendered into the empty middle regions of the
//      uploaded template, auto-scaled to fit. Region rects are in the template's
//      own 1536×1024 space (tuned to the header/footer of the supplied template).
const TPL_W = 1536, TPL_H = 1024;
const FRONT_REGION = { left: 56, top: 160, width: 672, height: 690 };
const BACK_REGION = { left: 808, top: 160, width: 672, height: 690 };

// Scales its content DOWN (never up) so it fits within the fixed region height —
// so long questions/explanations shrink to fit instead of overflowing.
function FitRegion({ rect, children }) {
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const sh = el.scrollHeight; // untransformed layout height (transform doesn't affect it)
    const k = sh > rect.height ? rect.height / sh : 1;
    if (Math.abs(k - scale) > 0.004) setScale(k);
  });
  return (
    <div style={{ position: "absolute", left: rect.left, top: rect.top, width: rect.width, height: rect.height, overflow: "hidden" }}>
      <div ref={innerRef} style={{ width: rect.width, transformOrigin: "top left", transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

function TemplateOverlay({ q, tpl, onImg }) {
  return (
    <div data-card-el style={{ position: "relative", width: TPL_W, height: TPL_H, fontFamily: "Inter, Arial, sans-serif" }}>
      <img src={tpl} alt="" onLoad={onImg} onError={onImg} style={{ position: "absolute", inset: 0, width: TPL_W, height: TPL_H, objectFit: "contain" }} />
      <FitRegion rect={FRONT_REGION}><FrontContent q={q} /></FitRegion>
      <FitRegion rect={BACK_REGION}><BackContent q={q} /></FitRegion>
    </div>
  );
}

// ---- BUILT-IN design (no template uploaded) ------------------------------
function Brand({ badge, badgeColor }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"><GraduationCap className="h-5 w-5" /></span>
        <span className="text-lg font-extrabold leading-none"><span className="text-slate-900">My</span><span className="text-brand-600">Study</span><span className="text-slate-900">Guide</span></span>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${badgeColor}`}>
        {badge === "Answer" ? <CheckCircle2 className="h-4 w-4" /> : <BookOpenCheck className="h-4 w-4" />} {badge}
      </span>
    </div>
  );
}

function BuiltInFlashcard({ q, ready }) {
  return (
    <div data-card-ready={ready ? "1" : "0"} data-card-el style={{ display: "flex", gap: 20, width: 968 }}>
      <div className="card flex flex-col p-5" style={{ width: 474, position: "relative" }}>
        <Brand badge="Flashcard" badgeColor="bg-brand-50 text-brand-700" />
        <FrontContent q={q} />
        <div className="mt-auto pt-4">
          <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white"><Eye className="h-4 w-4" /> Show Answer</div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400"><span className="italic">“Small Steps Big Results”</span><span>Learn • Practice • Succeed</span></div>
        </div>
      </div>
      <div className="card flex flex-col p-5" style={{ width: 474 }}>
        <Brand badge="Answer" badgeColor="bg-emerald-50 text-emerald-700" />
        <BackContent q={q} />
      </div>
    </div>
  );
}

export default function FlashcardCardImage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const tpl = sp.get("tpl") || "";
  const [q, setQ] = useState(null);
  const [error, setError] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const [imgReady, setImgReady] = useState(false);
  const useTemplate = !!tpl && !!q; // region rendering handles every question type
  const ready = fontsReady && (!useTemplate || imgReady);

  useEffect(() => { document.documentElement.classList.remove("dark"); }, []);

  useEffect(() => {
    let alive = true;
    contentService.cardQuestion(id, { answer: true })
      .then((data) => { if (alive) setQ(data); })
      .catch((e) => { if (alive) setError(e.message || "Question not found"); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!q) return;
    let alive = true;
    const done = () => { if (alive) requestAnimationFrame(() => requestAnimationFrame(() => alive && setFontsReady(true))); };
    if (typeof document !== "undefined" && document.fonts?.ready) document.fonts.ready.then(done).catch(done);
    else done();
    return () => { alive = false; };
  }, [q]);

  if (error) return <div data-card-error="1" style={{ padding: 24, fontFamily: "sans-serif" }}>{error}</div>;
  if (!q) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading…</div>;

  if (useTemplate) {
    return (
      <div data-card-ready={ready ? "1" : "0"} style={{ background: "#ffffff", display: "inline-block" }}>
        <TemplateOverlay q={q} tpl={tpl} onImg={() => setImgReady(true)} />
      </div>
    );
  }

  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", display: "flex", justifyContent: "center", padding: 24 }}>
      <BuiltInFlashcard q={q} ready={ready} />
    </div>
  );
}
