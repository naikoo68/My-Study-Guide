// Admin tool: add or update the FLASHCARD DETAILS (Key Points + Quick Recall +
// Explanation) for each question in a quiz — with a LIVE PREVIEW of the actual
// flashcard rendered on the admin's uploaded template, and TWO AI actions:
//   • "Generate with AI" per question   → aiService.extendOne (synchronous)
//   • "Generate for whole quiz with AI"  → aiService.extendExplanations (job)
// Manual editing (+ Save) still works for fine-tuning after AI.
import { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { X, Loader2, Save, CheckCircle2, Search, Sparkles, Wand2, AlertTriangle } from "lucide-react";
import { contentService, testService, settingsService, aiService } from "../../services";
import { stemPreview } from "../../lib/questionCompleteness";
import { TemplateOverlay, BuiltInFlashcard } from "../../pages/FlashcardCardImage";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const toRow = (q) => ({
  _id: q._id,
  q, // full question, kept so the live preview can render every field
  type: q.type || "mcq",
  text: q.text || "",
  keyPointsText: (Array.isArray(q.keyPoints) ? q.keyPoints : []).join("\n"),
  quickRecall: q.quickRecall || "",
  explanation: q.explanation || "",
  saving: false, saved: false, err: "", aiing: false,
});

const parseKeyPoints = (text) => text.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 8);

// The question object the preview renders — the STORED question merged with the
// row's current (possibly unsaved) edits, so the flashcard updates as you type
// or after an AI fill.
const previewQuestion = (r) => ({
  ...r.q,
  keyPoints: parseKeyPoints(r.keyPointsText),
  quickRecall: r.quickRecall,
  explanation: r.explanation,
});

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

// Responsive flashcard preview: fills the available width and renders the real
// flashcard — on the uploaded template when there is one, else the built-in card.
function FlashcardPreview({ q, tpl }) {
  const boxRef = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    let ro;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(el); }
    return () => ro?.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700">
      {w > 0 && (
        <ScaledPreview width={w}>
          {tpl ? <TemplateOverlay q={q} tpl={tpl} onImg={() => {}} /> : <BuiltInFlashcard q={q} ready />}
        </ScaledPreview>
      )}
    </div>
  );
}

export default function FlashcardDetailsModal({ title, loadQuestions, onClose, aiTarget }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [tpl, setTpl] = useState(""); // uploaded flashcard template URL ("" = built-in design)
  // Whole-quiz AI job state.
  const [bulk, setBulk] = useState({ running: false, done: 0, total: 0, err: "", finished: false });

  // Fetch questions from the SERVER when we know the quiz/test (so a reload after
  // AI shows fresh data); otherwise fall back to the caller's loader.
  const fetchQuestions = useCallback(() => {
    if (aiTarget?.quiz) return contentService.quizQuestions(aiTarget.quiz);
    if (aiTarget?.testSeries) return testService.getQuestions(aiTarget.testSeries);
    return Promise.resolve(loadQuestions());
  }, [aiTarget, loadQuestions]);

  useEffect(() => {
    setLoading(true); setError("");
    Promise.all([
      Promise.resolve(fetchQuestions()).then((qs) => (Array.isArray(qs) ? qs : (qs?.items || []))),
      settingsService.get().catch(() => ({})),
    ])
      .then(([qs, settings]) => {
        setRows(qs.map(toRow));
        const enabled = settings?.fbFlashcardTemplateEnabled !== false;
        setTpl(enabled && settings?.fbFlashcardTemplateUrl ? settings.fbFlashcardTemplateUrl : "");
      })
      .catch((e) => setError(e.message || "Failed to load questions."))
      .finally(() => setLoading(false));
  }, [fetchQuestions]);

  const setField = (id, field, val) =>
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, [field]: val, saved: false, err: "" } : r)));

  // Manual save of ONE question's flashcard fields.
  const save = async (row) => {
    setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, saving: true, err: "" } : r)));
    try {
      const keyPoints = parseKeyPoints(row.keyPointsText);
      const quickRecall = row.quickRecall.trim();
      const explanation = row.explanation;
      await contentService.updateQuestion(row._id, { keyPoints, quickRecall, explanation });
      setRows((rs) => rs.map((r) => (r._id === row._id
        ? { ...r, q: { ...r.q, keyPoints, quickRecall, explanation }, saving: false, saved: true }
        : r)));
    } catch (e) {
      setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, saving: false, err: e.message || "Save failed" } : r)));
    }
  };

  // AI-fill ONE question (synchronous). extendOne enriches explanation + key
  // points + quick recall and persists them, returning the updated fields.
  const aiOne = async (row) => {
    setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, aiing: true, err: "", saved: false } : r)));
    try {
      const updated = await aiService.extendOne({ questionId: row._id });
      setRows((rs) => rs.map((r) => {
        if (r._id !== row._id) return r;
        const q2 = { ...r.q, ...updated };
        const kp = Array.isArray(updated.keyPoints) ? updated.keyPoints : (Array.isArray(r.q.keyPoints) ? r.q.keyPoints : []);
        return {
          ...r,
          q: q2,
          keyPointsText: kp.join("\n"),
          quickRecall: (updated.quickRecall ?? r.quickRecall) || "",
          explanation: (updated.explanation ?? r.explanation) || "",
          aiing: false, saved: true,
        };
      }));
    } catch (e) {
      setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, aiing: false, err: e.message || "AI failed" } : r)));
    }
  };

  // AI-fill the WHOLE quiz: kick off the background job, poll to completion, then
  // reload every question so the previews + fields reflect the AI results.
  const aiAll = async () => {
    if (!aiTarget || bulk.running) return;
    setBulk({ running: true, done: 0, total: rows.length, err: "", finished: false });
    try {
      const { jobId, requested } = await aiService.extendExplanations(aiTarget);
      setBulk((b) => ({ ...b, total: requested || rows.length }));
      let done = false;
      for (let i = 0; i < 300 && !done; i++) {
        await sleep(2000);
        let s;
        try { s = await aiService.job(jobId); } catch { continue; }
        setBulk((b) => ({ ...b, done: s.count ?? b.done, total: s.requested ?? b.total }));
        if (s.status === "done") done = true;
        else if (s.status === "error") throw new Error(s.error || "AI generation failed.");
      }
      const qs = await fetchQuestions().then((r) => (Array.isArray(r) ? r : (r?.items || [])));
      setRows(qs.map(toRow));
      setBulk({ running: false, done: 0, total: 0, err: "", finished: true });
    } catch (e) {
      setBulk({ running: false, done: 0, total: 0, err: e.message || "AI generation failed.", finished: false });
    }
  };

  const q = search.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.text.toLowerCase().includes(q)) : rows;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
      <div className="mt-4 w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold">
            🎴 Flashcard details
            {title && <span className="text-sm font-normal text-slate-400">— {title}</span>}
          </h3>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Each question is previewed as the real flashcard{tpl ? " on your uploaded template" : ""}. Fill the <b>Key Points</b> (one per line), <b>Quick Recall</b> hook and <b>Explanation</b> — or let AI do it for one question or the whole quiz.
        </p>

        {/* Whole-quiz AI + template status */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {aiTarget && (
            <button
              onClick={aiAll}
              disabled={bulk.running || loading}
              className="btn-primary !py-1.5 text-sm"
              title="Use AI to add Key Points, Quick Recall & Explanation to every question in this quiz"
            >
              {bulk.running
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating {bulk.done}/{bulk.total}…</>
                : <><Wand2 className="h-4 w-4" /> Generate for whole quiz with AI</>}
            </button>
          )}
          {bulk.finished && <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> AI filled the quiz</span>}
          {bulk.err && <span className="inline-flex items-center gap-1 text-sm font-medium text-rose-600"><AlertTriangle className="h-4 w-4" /> {bulk.err}</span>}
        </div>
        {!tpl && !loading && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            No flashcard template uploaded — showing the built-in design. Upload a template in <b>Facebook → Flashcard template</b> to preview it here.
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading questions…</div>
        ) : error ? (
          <p className="py-6 text-sm font-medium text-rose-600">{error}</p>
        ) : (
          <>
            {rows.length > 6 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter questions…" className="w-full bg-transparent text-sm outline-none" />
              </div>
            )}
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {shown.map((r, i) => (
                <div key={r._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                    <span className="mr-1.5 text-slate-400">{i + 1}.</span>{stemPreview(r, 120)}
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">{r.type}</span>
                  </p>

                  {/* Live flashcard preview */}
                  <div className="mb-3">
                    <FlashcardPreview q={previewQuestion(r)} tpl={tpl} />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-amber-600">Key Points (one per line)</label>
                      <textarea className="input min-h-[80px] text-sm" value={r.keyPointsText} onChange={(e) => setField(r._id, "keyPointsText", e.target.value)} placeholder="First key point&#10;Second key point" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-indigo-600">Quick Recall (one-line hook)</label>
                        <input className="input text-sm" value={r.quickRecall} onChange={(e) => setField(r._id, "quickRecall", e.target.value)} placeholder="e.g. Malaria = female Anopheles" />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-semibold text-sky-600">Explanation</label>
                        <textarea className="input min-h-[44px] text-sm" value={r.explanation} onChange={(e) => setField(r._id, "explanation", e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button onClick={() => aiOne(r)} disabled={r.aiing || r.saving} className="btn-outline !py-1 !text-xs text-violet-600" title="Use AI to fill this question's flashcard details">
                      {r.aiing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Sparkles className="h-3.5 w-3.5" /> Generate with AI</>}
                    </button>
                    <button onClick={() => save(r)} disabled={r.saving || r.aiing} className="btn-primary !py-1 !text-xs">
                      {r.saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save</>}
                    </button>
                    {r.saved && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
                    {r.err && <span className="text-xs font-medium text-rose-600">{r.err}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
