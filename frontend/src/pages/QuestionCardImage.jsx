// Chrome-less render of the EXACT quiz question card for ONE question. The
// backend screenshots this page with a headless browser to produce a Facebook/
// Instagram image that is PIXEL-IDENTICAL to the on-screen quiz card (and to the
// admin Download button) — because it reuses the very same sub-components and
// Tailwind classes as the quiz player, so there's zero visual drift.
//
// Route: /q-card/:id   (?answer=1 highlights the correct option, mirroring a
// schedule's "Reveal answer" toggle). It renders a fixed-width card on a white
// page and sets data-card-ready="1" once the question AND web fonts (Inter +
// KaTeX) have loaded, so the screenshot is never captured half-styled.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Clock } from "lucide-react";
import { contentService } from "../services";
import Badge from "../components/ui/Badge";
import MathText from "../components/ui/MathText";
import OptionContent from "../components/ui/OptionContent";
import StatementPairView from "../components/ui/StatementPairView";
import TableView from "../components/ui/TableView";
import GraphView from "../components/ui/GraphView";
import VizView from "../components/ui/VizView";
import AssertionReasonView from "../components/ui/AssertionReasonView";
import { questionDateText, stemText, displayOptions } from "../lib/questions";

const optionLabels = ["A", "B", "C", "D", "E", "F"];
function toRoman(num) {
  const map = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
  let r = "";
  for (const [s, v] of map) while (num >= v) { r += s; num -= v; }
  return r;
}

export default function QuestionCardImage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const showAnswer = sp.get("answer") === "1";
  const [q, setQ] = useState(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Force LIGHT theme for the capture (the posted card is always light), no
  // matter what theme preference the headless browser might otherwise pick up.
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    let alive = true;
    contentService.cardQuestion(id, { answer: showAnswer })
      .then((data) => { if (alive) setQ(data); })
      .catch((e) => { if (alive) setError(e.message || "Question not found"); });
    return () => { alive = false; };
  }, [id, showAnswer]);

  // Mark ready only after the question is in the DOM AND web fonts are loaded.
  useEffect(() => {
    if (!q) return;
    let alive = true;
    const done = () => {
      if (!alive) return;
      // two frames so layout/paint settle before the screenshot
      requestAnimationFrame(() => requestAnimationFrame(() => alive && setReady(true)));
    };
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(done).catch(done);
    } else {
      done();
    }
    return () => { alive = false; };
  }, [q]);

  if (error) return <div data-card-error="1" style={{ padding: 24, fontFamily: "sans-serif" }}>{error}</div>;
  if (!q) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading…</div>;

  const isMatching = q.type === "matching";
  const optionCls = (idx) =>
    showAnswer && idx === q.correct
      ? "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium border-emerald-500 bg-emerald-50 text-emerald-800"
      : "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium border-slate-200 bg-white";
  const badgeCls = (idx) =>
    showAnswer && idx === q.correct
      ? "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-500 bg-emerald-500 text-white text-xs font-bold"
      : "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 text-xs font-bold";

  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", display: "flex", justifyContent: "center", padding: 24 }}>
      {/* data-card-el marks the exact node the screenshotter clips to. */}
      <div data-card-ready={ready ? "1" : "0"} style={{ width: 960 }}>
        <div data-card-el className="card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={q.difficulty}>{q.difficulty}</Badge>
              {questionDateText(q) && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" /> {questionDateText(q)}
                </span>
              )}
            </div>
          </div>

          {q.image && <img src={q.image} alt="" className="mb-4 max-h-64 rounded-xl object-contain" />}
          <h2 className="text-lg font-semibold leading-relaxed">
            <MathText>{stemText(q)}</MathText>
          </h2>

          {isMatching && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">Column A</p>
                <div className="space-y-2">
                  {(q.columnA || []).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
                      <MathText>{item}</MathText>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-600">Column B</p>
                <div className="space-y-2">
                  {(q.columnB || []).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-accent-100 text-xs font-bold text-accent-700">{toRoman(i + 1)}</span>
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

          <div className="mt-5 space-y-3">
            {isMatching && <p className="text-sm font-medium text-slate-500">Choose the correct matching sequence:</p>}
            {displayOptions(q).map((opt, idx) => (
              <div key={idx} className={optionCls(idx)}>
                <span className={badgeCls(idx)}>{isMatching ? `(${String.fromCharCode(97 + idx)})` : optionLabels[idx]}</span>
                <span className="flex-1"><OptionContent>{opt}</OptionContent></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
