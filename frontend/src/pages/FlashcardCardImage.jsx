// Chrome-less flashcard for ONE question, screenshotted by the backend (cardShot)
// to produce a single combined social image for the "Flashcard" auto-post type.
//
// Two render modes:
//  • DEFAULT (no ?tpl): a built-in two-panel branded flashcard (question | answer).
//  • TEMPLATE OVERLAY (?tpl=<image url>): the admin's uploaded template image is
//    the background, and the quiz content is placed into its boxes at fixed
//    coordinates (tuned to the 1024×660 two-panel template).
//
// Always fetches WITH the answer so the answer side can render. Sets
// data-card-ready="1" once the question + web fonts (+ template image, in overlay
// mode) have loaded so the screenshot is never captured half-styled.
import { useEffect, useState } from "react";
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
function toRoman(num) {
  const map = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
  let r = "";
  for (const [s, v] of map) while (num >= v) { r += s; num -= v; }
  return r;
}

// ---- TEMPLATE OVERLAY MODE ----------------------------------------------
// Box coordinates in px on the 1024×660 two-panel template. These are tuned by
// eye to the supplied template and may need small nudges after the first render.
// Output canvas size for the flashcard image. SLOTS below are authored against
// the BASE (the 1024×660 two-panel layout) and scaled to the canvas, so the
// posted size can change without re-authoring every box.
const TPL_W = 1536, TPL_H = 1024;
const BASE_W = 1024, BASE_H = 660;
const SX = TPL_W / BASE_W, SY = TPL_H / BASE_H;
const SLOTS = {
  // front (left panel)
  subject:     { left: 40, top: 92, width: 76, height: 28, pill: "#d1fae5", color: "#047857", center: true, size: 12, bold: true },
  difficulty:  { left: 120, top: 92, width: 92, height: 28, pill: "#e0e7ff", color: "#4f46e5", center: true, size: 12, bold: true },
  question:    { left: 34, top: 142, width: 452, height: 88, size: 15, bold: true, color: "#0f172a" },
  optA:        { left: 88, top: 262, width: 388, height: 40, size: 13, color: "#1e293b", vcenter: true },
  optB:        { left: 88, top: 329, width: 388, height: 40, size: 13, color: "#1e293b", vcenter: true },
  optC:        { left: 88, top: 396, width: 388, height: 40, size: 13, color: "#1e293b", vcenter: true },
  optD:        { left: 88, top: 463, width: 388, height: 40, size: 13, color: "#1e293b", vcenter: true },
  // back (right panel)
  subjectR:    { left: 548, top: 92, width: 76, height: 28, pill: "#d1fae5", color: "#047857", center: true, size: 12, bold: true },
  difficultyR: { left: 628, top: 92, width: 92, height: 28, pill: "#e0e7ff", color: "#4f46e5", center: true, size: 12, bold: true },
  correct:     { left: 604, top: 150, width: 398, height: 40, size: 13, bold: true, color: "#065f46", vcenter: true },
  explanation: { left: 558, top: 264, width: 452, height: 90, size: 12, color: "#334155" },
  keypoints:   { left: 558, top: 410, width: 452, height: 52, size: 11.5, color: "#92400e" },
  quickrecall: { left: 558, top: 508, width: 452, height: 52, size: 12, color: "#3730a3" },
};

function Slot({ rect, children }) {
  const style = {
    position: "absolute",
    left: rect.left * SX, top: rect.top * SY, width: rect.width * SX, height: rect.height * SY,
    overflow: "hidden", fontSize: (rect.size || 13) * SX, lineHeight: 1.3, color: rect.color || "#0f172a",
    fontWeight: rect.bold ? 700 : 400, display: "flex",
    alignItems: rect.vcenter || rect.center ? "center" : "flex-start",
    justifyContent: rect.center ? "center" : "flex-start",
    textAlign: rect.center ? "center" : "left",
    ...(rect.pill ? { background: rect.pill, borderRadius: 999, padding: "0 6px" } : {}),
    fontFamily: "Inter, Arial, sans-serif",
  };
  return <div style={style}>{children}</div>;
}

function TemplateOverlay({ q, tpl, onImg }) {
  const opts = displayOptions(q) || [];
  const correctIdx = typeof q.correct === "number" ? q.correct : -1;
  const correctText = correctIdx >= 0 ? opts[correctIdx] : "";
  const kp = (Array.isArray(q.keyPoints) ? q.keyPoints : []).map((s) => String(s || "").trim()).filter(Boolean);
  return (
    <div data-card-el style={{ position: "relative", width: TPL_W, height: TPL_H }}>
      <img src={tpl} alt="" onLoad={onImg} onError={onImg}
        style={{ position: "absolute", inset: 0, width: TPL_W, height: TPL_H, objectFit: "contain" }} />
      {q.subjectName && <Slot rect={SLOTS.subject}>{q.subjectName}</Slot>}
      {q.difficulty && <Slot rect={SLOTS.difficulty}>{q.difficulty}</Slot>}
      <Slot rect={SLOTS.question}><MathText>{stemText(q)}</MathText></Slot>
      {opts[0] != null && <Slot rect={SLOTS.optA}><OptionContent>{opts[0]}</OptionContent></Slot>}
      {opts[1] != null && <Slot rect={SLOTS.optB}><OptionContent>{opts[1]}</OptionContent></Slot>}
      {opts[2] != null && <Slot rect={SLOTS.optC}><OptionContent>{opts[2]}</OptionContent></Slot>}
      {opts[3] != null && <Slot rect={SLOTS.optD}><OptionContent>{opts[3]}</OptionContent></Slot>}

      {q.subjectName && <Slot rect={SLOTS.subjectR}>{q.subjectName}</Slot>}
      {q.difficulty && <Slot rect={SLOTS.difficultyR}>{q.difficulty}</Slot>}
      {correctIdx >= 0 && (
        <Slot rect={SLOTS.correct}>
          <span>Correct Answer: {optionLabels[correctIdx] || correctIdx + 1}{correctText ? " — " : ""}<span style={{ fontWeight: 400 }}><MathText>{correctText}</MathText></span></span>
        </Slot>
      )}
      {q.explanation && <Slot rect={SLOTS.explanation}><MathText>{q.explanation}</MathText></Slot>}
      {kp.length > 0 && (
        <Slot rect={SLOTS.keypoints}>
          <span>{kp.map((p, i) => <span key={i} style={{ display: "block" }}>• <MathText>{p}</MathText></span>)}</span>
        </Slot>
      )}
      {q.quickRecall && <Slot rect={SLOTS.quickrecall}><MathText>{q.quickRecall}</MathText></Slot>}
    </div>
  );
}

// ---- BUILT-IN DESIGN (no template uploaded) ------------------------------
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
  const isMatching = q?.type === "matching";
  const pill = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
  return (
    <div data-card-ready={ready ? "1" : "0"} data-card-el style={{ display: "flex", gap: 20, width: 968 }}>
      <div className="card flex flex-col p-5" style={{ width: 474, position: "relative" }}>
        <Brand badge="Flashcard" badgeColor="bg-brand-50 text-brand-700" />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {q.subjectName && <span className={`${pill} bg-emerald-50 text-emerald-700`}>{q.subjectName}</span>}
          <Badge variant={q.difficulty}>{q.difficulty}</Badge>
        </div>
        <h2 className="text-base font-bold leading-relaxed"><MathText>{stemText(q)}</MathText></h2>
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
        <div className="mt-auto pt-4">
          <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white"><Eye className="h-4 w-4" /> Show Answer</div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400"><span className="italic">“Small Steps Big Results”</span><span>Learn • Practice • Succeed</span></div>
        </div>
      </div>
      <div className="card flex flex-col p-5" style={{ width: 474 }}>
        <Brand badge="Answer" badgeColor="bg-emerald-50 text-emerald-700" />
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {q.subjectName && <span className={`${pill} bg-emerald-50 text-emerald-700`}>{q.subjectName}</span>}
          <Badge variant={q.difficulty}>{q.difficulty}</Badge>
        </div>
        <FlashcardAnswer q={q} />
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
  const [imgReady, setImgReady] = useState(!tpl); // template image loaded (or none)
  const ready = fontsReady && imgReady;

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

  if (tpl) {
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
