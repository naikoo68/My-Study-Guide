// Chrome-less TWO-PANEL flashcard for ONE question, screenshotted by the backend
// (cardShot) to produce a single combined social image for the "Flashcard"
// auto-post type: LEFT = the question (front), RIGHT = the answer (back) with the
// correct answer, explanation, key points and a quick-recall hook.
//
// Route: /flashcard/:id  — always fetches with the answer so the back panel can
// render. Sets data-card-ready="1" once the question AND web fonts are loaded so
// the screenshot is never captured half-styled. Reuses the same question
// sub-components as the quiz player, plus the shared FlashcardAnswer panel.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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

// Small brand header shown at the top of each panel.
function Brand({ badge, badgeColor }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
          <GraduationCap className="h-5 w-5" />
        </span>
        <span className="text-lg font-extrabold leading-none">
          <span className="text-slate-900">My</span><span className="text-brand-600">Study</span><span className="text-slate-900">Guide</span>
        </span>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${badgeColor}`}>
        {badge === "Answer" ? <CheckCircle2 className="h-4 w-4" /> : <BookOpenCheck className="h-4 w-4" />} {badge}
      </span>
    </div>
  );
}

export default function FlashcardCardImage() {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [error, setError] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const isMatching = q?.type === "matching";

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

  const pill = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", display: "flex", justifyContent: "center", padding: 24 }}>
      <div data-card-ready={fontsReady ? "1" : "0"} data-card-el style={{ display: "flex", gap: 20, width: 968 }}>
        {/* FRONT — the question */}
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
                <div className="space-y-1.5">
                  {(q.columnA || []).map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-brand-100 text-[10px] font-bold text-brand-700">{i + 1}</span>
                      <MathText>{item}</MathText>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-600">Column B</p>
                <div className="space-y-1.5">
                  {(q.columnB || []).map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-accent-100 text-[10px] font-bold text-accent-700">{toRoman(i + 1)}</span>
                      <MathText>{item}</MathText>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <StatementPairView q={q} />
          <TableView q={q} />
          <GraphView q={q} />
          <VizView q={q} />
          <AssertionReasonView q={q} />

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
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white">
              <Eye className="h-4 w-4" /> Show Answer
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span className="italic">“Small Steps Big Results”</span>
              <span>Learn • Practice • Succeed</span>
            </div>
          </div>
        </div>

        {/* BACK — the answer */}
        <div className="card flex flex-col p-5" style={{ width: 474 }}>
          <Brand badge="Answer" badgeColor="bg-emerald-50 text-emerald-700" />
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {q.subjectName && <span className={`${pill} bg-emerald-50 text-emerald-700`}>{q.subjectName}</span>}
            <Badge variant={q.difficulty}>{q.difficulty}</Badge>
          </div>
          {/* Reuses the exact answer sections from the quiz reveal. */}
          <FlashcardAnswer q={q} />
        </div>
      </div>
    </div>
  );
}
