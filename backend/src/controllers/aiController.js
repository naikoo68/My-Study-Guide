// AI Question Generator — talks to any OpenAI-compatible provider
import AiKey from "../models/AiKey.js";
import Question from "../models/Question.js";
import { ownerFilter } from "../utils/ownership.js";

// Works with any OpenAI-compatible provider (Gemini, TokenLab, OpenAI, Groq,
// DeepSeek, …). Keys come from TWO places, both used together:
//   1) Admin panel (stored in the DB) — add/enable/test keys from the UI.
//   2) Env-var slots (AI_API_KEY / AI_API_KEY_2..6 with matching AI_BASE_URL /
//      AI_MODEL) — for server-side config.
// Every model from every ENABLED key appears in the admin dropdown; each
// generation uses a key that owns the chosen model, falling back to the next
// key on a quota error. Keys live ONLY on the server.
const MAX_SLOTS = 6;
const DEFAULT_BASE = "https://api.tokenlab.sh/v1";

function envProviders() {
  const out = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const sfx = i === 1 ? "" : `_${i}`;
    const key = (process.env[`AI_API_KEY${sfx}`] || "").trim();
    if (!key) continue;
    const baseUrl = (process.env[`AI_BASE_URL${sfx}`] || DEFAULT_BASE).replace(/\/$/, "");
    const models = (process.env[`AI_MODEL${sfx}`] || "gpt-4o-mini").split(",").map((m) => m.trim()).filter(Boolean);
    out.push({ key, baseUrl, models: models.length ? models : ["gpt-4o-mini"] });
  }
  return out;
}

// A "scope" decides which key pool a request draws from:
//   { owner, includeEnv } — owner null = platform/built-in keys (admin), a user
//   id = that client's own keys. Env-var slots are only ever part of the
//   platform pool. The default scope is the platform pool (admin behaviour).
const SYSTEM_SCOPE = { owner: null, includeEnv: true, mode: "inbuilt", access: true };

// Decide the key scope for the requesting user. Non-clients (admin/student) and
// anonymous callers always use the platform pool. A client uses the pool that
// matches their chosen mode — but only within what the admin allows. A client
// with no AI access (or with both pools disabled) is denied.
function resolveScope(user, requestedMode) {
  if (!user || user.role !== "client") return { ...SYSTEM_SCOPE };
  if (!user.aiAccess) return { owner: null, includeEnv: false, access: false, denied: true };
  const allowInbuilt = user.aiAllowInbuilt !== false;
  const allowSelf = user.aiAllowSelf !== false;
  if (!allowInbuilt && !allowSelf) return { owner: null, includeEnv: false, access: false, denied: true };
  // A per-request choice (picked in the AI generator) wins over the saved
  // preference; otherwise fall back to the client's stored mode. Either way the
  // result is corrected to a pool the admin actually allows.
  const requested = requestedMode === "self" || requestedMode === "inbuilt" ? requestedMode : null;
  let mode = requested || (user.aiMode === "self" ? "self" : "inbuilt");
  if (mode === "self" && !allowSelf) mode = "inbuilt";
  if (mode === "inbuilt" && !allowInbuilt) mode = "self";
  return mode === "self"
    ? { owner: user._id, includeEnv: false, mode, access: true, allowInbuilt, allowSelf }
    : { owner: null, includeEnv: true, mode, access: true, allowInbuilt, allowSelf };
}

// Active providers for a scope = DB keys (enabled, matching owner) first, then
// env slots when the scope includes them (platform pool only).
async function providers(scope = SYSTEM_SCOPE) {
  const db = await AiKey.find({ enabled: true, owner: scope.owner ?? null }).sort("order createdAt").lean();
  const dbProviders = db
    .filter((k) => (k.key || "").trim())
    .map((k) => {
      const models = (k.models || "").split(",").map((m) => m.trim()).filter(Boolean);
      return {
        key: k.key.trim(),
        baseUrl: (k.baseUrl || DEFAULT_BASE).replace(/\/$/, ""),
        models: models.length ? models : ["gemini-2.5-flash"],
      };
    });
  // DB keys first, then env slots (if in scope) — de-duplicated by key value so
  // the same key isn't used twice if it's both imported and still set in Render.
  const seen = new Set();
  const deduped = [];
  const pool = scope.includeEnv ? [...dbProviders, ...envProviders()] : dbProviders;
  for (const p of pool) {
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    deduped.push(p);
  }
  return deduped;
}

// Flat list of every available model with the key + base URL that serves it.
async function modelRegistry(scope = SYSTEM_SCOPE) {
  const reg = [];
  for (const p of await providers(scope)) {
    for (const m of p.models) {
      if (!reg.some((r) => r.model === m)) reg.push({ model: m, key: p.key, baseUrl: p.baseUrl });
    }
  }
  return reg;
}

// Resolve a requested model → { model, endpoints:[{key,baseUrl}] }. Endpoints are
// EVERY enabled key whose model list includes this model. This lets several keys
// (e.g. different Gemini accounts) serve the same model, so the generator can
// fall back to the next key when one hits its quota.
async function resolveModel(requested, scope = SYSTEM_SCOPE) {
  const provs = await providers(scope);
  if (!provs.length) return null;
  const defModel = provs[0].models[0];
  const model = provs.some((p) => p.models.includes(requested)) ? requested : defModel;
  const endpoints = provs
    .filter((p) => p.models.includes(model))
    .map((p) => ({ key: p.key, baseUrl: p.baseUrl }));
  return { model, endpoints };
}

// Try a request across all keys that serve the model, moving to the next key on
// a quota/auth error (429/401/403). Other errors aren't retried on another key.
async function callWithFallback({ endpoints, model, userPrompt, maxTokens, owner = null, systemPrompt }) {
  let last = { ok: false, status: 0, detail: "No AI key is configured." };
  for (const ep of endpoints || []) {
    const r = await callProvider({ key: ep.key, baseUrl: ep.baseUrl, model, userPrompt, maxTokens, systemPrompt });
    if (r.ok) {
      // Record app-side usage on the matching DB key (env-only keys aren't in
      // the DB, so this is a no-op for them). Scoped by owner so a client key
      // and a platform key that share a value never cross-update. Fire-and-forget.
      AiKey.updateOne({ key: ep.key, owner: owner ?? null }, { $inc: { usedRequests: 1, usedTokens: r.tokens || 0 } }).catch(() => {});
      return r;
    }
    last = r;
    if (![429, 401, 403].includes(r.status)) break;
  }
  return last;
}

const TYPES = ["mcq", "matching", "statement", "pair", "pairselect", "assertion", "table"];
const DIFFS = ["Easy", "Medium", "Hard"];

// --- Semantic-ish duplicate detection (so the generator stops returning the
// SAME fact reworded) -------------------------------------------------------
// Common words carry no topic meaning — ignore them when comparing questions.
const STOPWORDS = new Set(
  ("the a an of to in on at for and or but is are was were be been being do does did which what who whom whose when where why how " +
   "that this these those with without into from by as it its their his her they them following consider statement statements " +
   "correct incorrect true false not all none only both about above given below choose select mark identify option options " +
   "question answer among between will would can could should may might your you i we he she has have had than then there here")
    .split(/\s+/)
);

// The set of meaningful words in a question stem (lower-cased, length ≥ 4,
// stopwords removed) — used to measure topical overlap between two questions.
function contentTokens(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/\$[^$]*\$/g, " ") // drop inline math so wording, not symbols, is compared
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

// Jaccard overlap of two token sets (0 = nothing shared, 1 = identical).
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// Normalised text of a question's CORRECT option (a strong "same fact" signal
// for MCQ/table — a reworded duplicate keeps the same answer).
function correctAnswerNorm(q) {
  const opt = Array.isArray(q?.options) ? q.options[q?.correct] : "";
  return String(opt || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
// Structured types have generic options ("Both A and R…") so answer-matching
// there would wrongly merge distinct questions — only trust it for these.
const ANSWER_DEDUP_TYPES = new Set(["mcq", "table"]);

// Strip a leading list marker ("1.", "2)", "I.", "(iii)") from a column/statement
// item — the app auto-numbers Column A (1,2,3,4) and Column B (I,II,III,IV).
const stripListMarker = (x) =>
  String(x || "").replace(/^\s*[([]?\s*(?:\d{1,2}|[ivxlcIVXLC]{1,5})\s*[.)\]:\-]\s+/, "").trim();

// GET /api/ai/status — lets the admin UI show/hide the "Generate with AI"
// button and populate the model dropdown.
export async function aiStatus(req, res) {
  const scope = resolveScope(req.user, req.query?.mode);
  if (scope.denied) {
    return res.json({ enabled: false, denied: true, mode: null, keys: 0, models: [], model: "" });
  }
  const reg = await modelRegistry(scope);
  const provs = await providers(scope);
  res.json({
    enabled: reg.length > 0,
    mode: scope.mode, // "inbuilt" | "self" — which pool this request used
    model: reg[0]?.model || "", // default / first configured model
    models: reg.map((r) => r.model), // every model across all keys (dropdown)
    keys: provs.length, // how many API keys are active in this scope
  });
}

const SYSTEM_PROMPT = `You are an exam-preparation question writer. You output ONLY valid JSON, no markdown, no commentary.
Return an object of the exact shape: {"questions": [ ... ]}.
Each question object uses these fields:
- "type": one of "mcq", "matching", "statement", "pair", "pairselect", "assertion", "table".
- "text": the question stem (may include LaTeX between $...$).
- "options": array of EXACTLY 4 answer strings.
- "correct": 0-based index (0-3) of the correct option in "options".
- "difficulty": one of "Easy", "Medium", "Hard".
- "explanation": a THOROUGH, self-contained explanation of the correct answer (3-6 sentences). Include EVERY relevant supporting fact a student needs — exact dates/years, historical background, definitions, full formulas WITH the actual calculation, laws/theorems/principles by name, cause-and-effect reasoning, and any key names, places or numbers. Never give a one-line answer or just restate the option; teach the concept as if to someone seeing it for the first time. FORMATTING: break the explanation into MULTIPLE short lines — put each sentence or distinct point on its OWN line (use a line break between points, and a blank line between grouped points); NEVER write it as one long paragraph.
- LOCAL / ALTERNATIVE NAMES: whenever a term, concept, place, person, species, disease, chemical, unit, festival, law or any answer option ALSO has another name — a common or locally/regionally used name (including the vernacular / Hindi / local-language term), a synonym, an abbreviation's full form, or an old/renamed title — ALWAYS mention that alternative name in brackets right after it, so learners recognise it by the name they use locally. Examples: "Sodium bicarbonate (baking soda; 'khaane wala soda')", "Mumbai (formerly Bombay)", "Tuberculosis (TB)", "Vitamin C (ascorbic acid)". Add it in both "explanation" and the relevant "optionExplanations" entries.
- "optionExplanations": array of EXACTLY 4 strings, one per option, clearly explaining why each specific option is right or wrong (for wrong ones, name the exact misconception or fact that makes it incorrect). Include the local/alternative name of an option in brackets where one exists. Leave the correct option's entry an empty string "".
- "correct": distribute the correct answer's position EVENLY and RANDOMLY across the four options over the whole set — do NOT keep putting the answer at option A. Aim for a roughly equal spread of correct answers landing on positions 0, 1, 2 and 3.
Type-specific rules — each type needs specific extra fields AND a specific style of "options":
- "mcq": a normal question with 4 plausible options; "correct" is the right one. No extra fields.
- "matching": include "columnA" (array) and "columnB" (array) — the two lists to match. The 4 "options" are FULL MAPPING SEQUENCES like "1-III, 2-I, 3-IV, 4-II" (Column A is auto-numbered 1,2,3,4; Column B is I,II,III,IV). Exactly one option is the correct complete mapping; the others are wrong mappings. In "explanation", justify EVERY correct pairing individually (e.g. "1-III because …; 2-I because …") with the fact/definition behind each match.
- "statement": put the individual statements in "columnA" (an array of 2-4 statement strings). "text" is the intro line, e.g. "Consider the following statements:". The 4 "options" are COMBINATIONS like "1 only", "2 only", "1 and 2 only", "Neither 1 nor 2".
- "pair": include "columnA" (left items) and "columnB" (right items); item i is paired with item i. "text" is the intro. The 4 "options" state HOW MANY pairs are correctly matched, e.g. "Only one pair", "Only two pairs", "Only three pairs", "All four pairs". In "explanation", go through EACH pair stating whether it is correctly matched and the fact behind it.
- "pairselect": include "columnA" and "columnB" (candidate pairs). "text" is the intro. The 4 "options" state WHICH pairs are correct, e.g. "1 and 2 only", "2 and 3 only", "1, 3 and 4 only", "All of the above". In "explanation", go through EACH pair stating whether it is correct or wrong and why.
- "assertion": include "assertion" (Assertion A text) and "reason" (Reason R text); "text" may be empty. The 4 "options" MUST be exactly: "Both A and R are true and R is the correct explanation of A", "Both A and R are true but R is NOT the correct explanation of A", "A is true but R is false", "A is false but R is true". In "explanation", separately evaluate Assertion (A) — state true/false and WHY with supporting facts — then separately evaluate Reason (R) — true/false and WHY — and finally explain the RELATIONSHIP: whether R correctly explains A and why.
- "table": put the data table in "tableRows" (a 2D array; the first inner array is the header row) — NEVER write it as a markdown/pipe ("| a | b |") table inside "text". "text" is ONLY the question sentence. Wrap any math in a cell in $...$. 4 normal options that match a calculation done from the table.
Do NOT prefix columnA / columnB / statement items with numbers or roman numerals (no "1.", "I.") — the app numbers Column A (1,2,3,4), Column B (I,II,III,IV) and statements (1,2,3) automatically.
VARIETY IS MANDATORY: within the set, every question must test a DIFFERENT fact / sub-topic and a DIFFERENT angle (definition, cause, effect, date or number, example, comparison, application, exception, sequence). NEVER ask about the same fact, entity or correct answer more than once, and NEVER reword or rephrase another question — a different sentence with the same meaning counts as a duplicate and is forbidden. Spread the questions across the full breadth of the topic rather than clustering on the few most obvious facts.
CALCULATIONS & SELF-VERIFICATION (do this for EVERY question before you finalise it):
- NUMERICAL / QUANTITATIVE questions: pick the correct FORMULA for the concept, substitute the actual values, and COMPUTE the answer step by step. Mark as "correct" ONLY the option that EXACTLY equals your computed result; make the other three plausible but genuinely wrong (each reflecting a specific common mistake). In "explanation" show the full working — formula, then substitution, then each intermediate result, then the final value — each step on its OWN line. NEVER mark an answer your own calculation does not produce, and make sure the explanation's steps end at the marked option.
- MATCHING / PAIR / STATEMENT questions: verify each pairing/statement individually and make "correct" reflect the TRUE count/combination (and provide an option that matches it).
- Re-check every calculation and fact; the marked "correct" option and the "optionExplanations" must be mutually consistent.
MATH RENDERING (so numericals display correctly): wrap EVERY mathematical element in $...$ (inline LaTeX) — in the "text", the "options" AND the "explanation". This includes each numeric ANSWER OPTION that is a number/quantity/expression (e.g. options "$12.5$", "$\\frac{3}{4}$", "$2^{10}$", "$25\\%$", "$\\sqrt{2}$", "$3:4$"), every fraction, power, root, ratio, percentage and equation, and each step of a calculation. A plain number that is only ordinary prose (a year, a page count) need not be wrapped, but any numeric option or math expression MUST be. Use $...$ only (never \\( \\) or \\[ \\]) and never write bare LaTeX commands outside dollar signs.
CURRENCY: NEVER use the "$" character for money/amounts anywhere ("text", "options", "explanation", "optionExplanations") — "$" is reserved ONLY for wrapping inline math, and a stray "$" (e.g. "$300") corrupts the rendering of the whole field. Write money as a plain number with the currency word, e.g. "300 dollars" or "900 rupees" or just "300".
Never include image URLs. Keep questions factually correct and self-contained.`;

function buildUserPrompt({ topic, count, difficulty, types, notes, plan, avoid, source }) {
  const lines = [];
  if (source) {
    lines.push(`Create the questions BASED ON the source material given at the end. Draw the facts and content from that material (you may use closely-related general knowledge to complete a question, but stay on the material's topics).`);
  }
  lines.push(`Topic / syllabus: ${topic}.`);

  if (Array.isArray(plan) && plan.length) {
    // Explicit per-bucket distribution (type × difficulty). List each bucket so
    // the model produces exactly the requested mix.
    const total = plan.reduce((s, b) => s + b.count, 0);
    lines.push(`Generate EXACTLY ${total} exam-prep questions, distributed precisely as follows:`);
    plan.forEach((b) => {
      lines.push(`- ${b.count} "${b.difficulty}" question(s) of type "${b.type}".`);
    });
    lines.push(`Each question's "type" and "difficulty" fields MUST match the bucket it belongs to.`);
  } else {
    const allowed = (types && types.length ? types : ["mcq"]).join(", ");
    lines.push(`Generate ${count} exam-prep questions.`);
    lines.push(`Allowed question types: ${allowed}. Prefer "mcq" unless another type fits better.`);
    lines.push(
      difficulty && DIFFS.includes(difficulty)
        ? `All questions must be "${difficulty}" difficulty.`
        : `Mix the difficulty across Easy, Medium and Hard.`
    );
  }

  if (notes) {
    lines.push(
      `======================\nMANDATORY USER INSTRUCTIONS (HIGHEST PRIORITY)\nThe following instructions come directly from the user and OVERRIDE any conflicting guidance above. Follow them EXACTLY and COMPLETELY for every single question. If they specify a language, style, focus, sub-topics to include or avoid, difficulty emphasis, format, or anything else, obey them without exception:\n${notes}\n======================`
    );
  }
  lines.push(
    `For every question write a rich, complete "explanation" that includes all relevant facts (dates, years, historical context, definitions, formulas with calculations, named laws/principles) — not a single line. Whenever a term/place/concept/option has a local or alternative name (common name, vernacular/Hindi/regional name, synonym, abbreviation's full form, or old name), add it in brackets. Write the explanation across several short lines — each point on its own line, not one paragraph. Vary which option (A/B/C/D) is correct across the set.`
  );
  lines.push(
    `VARIETY IS CRITICAL: make every question test a DISTINCT fact/sub-topic and a different angle (definition, cause, effect, date/number, example, comparison, application, exception). Do NOT ask about the same fact or the same correct answer twice, and do NOT reword/rephrase another question — a different sentence with the same meaning is a duplicate. Cover the full breadth of the topic, not just the most obvious facts.`
  );
  if (Array.isArray(avoid) && avoid.length) {
    const list = avoid.slice(0, 60).map((s, i) => `${i + 1}) ${String(s).slice(0, 120)}`).join("\n");
    lines.push(
      `IMPORTANT — these questions ALREADY EXIST. Do NOT repeat, restate, paraphrase, or ask the SAME FACT/answer as any of them even if worded differently; generate ENTIRELY DIFFERENT questions covering other facts/aspects of the topic:\n${list}`
    );
  }
  if (source) {
    lines.push(`SOURCE MATERIAL (base the questions on this):\n${source}`);
  }
  // Reinforce the user's instructions right before the model answers (recency)
  // so they are followed reliably.
  if (notes) lines.push(`REMINDER — apply the MANDATORY USER INSTRUCTIONS above to EVERY question: ${notes}`);
  lines.push(`Before finalising EACH question, VERIFY it: for a numerical question solve it with the correct formula step by step and mark ONLY the option equal to your computed result (show that working, each step on its own line, in the explanation); for matching/pair/statement questions check each item individually and make the answer reflect the true count/combination. The marked correct option must match your own working — never leave a wrong calculation or a mismatched answer.`);
  lines.push(`Return ONLY the JSON object {"questions":[...]}.`);
  return lines.join("\n");
}

// Pull the assistant's text out of an OpenAI-compatible response. Handles the
// normal string form AND Claude-style "content blocks" (an array of
// { type:"text", text:"..." }) that some proxies pass through unnormalized.
function extractContent(data) {
  const msg = data?.choices?.[0]?.message;
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("");
  }
  // Some reasoning models expose the answer under a different key.
  if (typeof msg?.reasoning_content === "string") return msg.reasoning_content;
  return "";
}

// Last-resort recovery: if the JSON is truncated (e.g. the model ran out of
// tokens mid-array), scan for every complete, brace-balanced {...} object and
// parse them individually. This keeps whatever questions did finish.
function salvageObjects(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const o = JSON.parse(text.slice(start, i + 1));
          if (o && typeof o === "object" && (o.text || o.options)) out.push(o);
        } catch {
          /* skip malformed fragment */
        }
        start = -1;
      }
    }
  }
  return out;
}

// Robustly pull a questions array out of the model's text output.
function parseQuestions(content) {
  let t = String(content || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  let obj;
  try {
    obj = JSON.parse(t);
  } catch {
    // Repair single-backslash LaTeX + raw control chars, then retry a straight
    // parse before falling back to slicing the outermost object/array.
    const repaired = repairJson(t);
    try { obj = JSON.parse(repaired); } catch { /* keep trying below */ }
    if (!obj) {
      const tryParse = (src, s, e) => {
        if (s === -1 || e === -1 || e <= s) return null;
        try { return JSON.parse(src.slice(s, e + 1)); } catch { return null; }
      };
      obj =
        tryParse(t, t.indexOf("{"), t.lastIndexOf("}")) ||
        tryParse(t, t.indexOf("["), t.lastIndexOf("]")) ||
        tryParse(repaired, repaired.indexOf("{"), repaired.lastIndexOf("}")) ||
        tryParse(repaired, repaired.indexOf("["), repaired.lastIndexOf("]"));
    }
  }
  if (!obj) return salvageObjects(repairJson(t)); // last resort: recover from truncated JSON
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.questions)) return obj.questions;
  return [];
}

// Coerce anything the model returned into a valid Question document shape.
function normalize(list) {
  const clampIdx = (n) => Math.min(3, Math.max(0, parseInt(n, 10) || 0));
  const asStr = (x) => (x == null ? "" : String(x));
  const arrStr = (a) => (Array.isArray(a) ? a.map(asStr) : []);

  return (Array.isArray(list) ? list : [])
    .map((q) => {
      const type = TYPES.includes(q?.type) ? q.type : "mcq";

      let options = arrStr(q?.options);
      while (options.length < 4) options.push("");
      options = options.slice(0, 4);

      const correct = clampIdx(q?.correct);

      let oe = arrStr(q?.optionExplanations);
      while (oe.length < 4) oe.push("");
      oe = oe.slice(0, 4);
      oe[correct] = ""; // correct option needs no "why it's wrong" note

      const out = {
        type,
        text: asStr(q?.text).trim(),
        options,
        correct,
        difficulty: DIFFS.includes(q?.difficulty) ? q.difficulty : "Medium",
        explanation: asStr(q?.explanation).trim(),
        optionExplanations: oe,
        status: "published",
        // Source question number (from a numbered paper), used only to de-duplicate
        // during extraction so the count matches the source exactly. Not persisted.
        n: Number.isFinite(Number(q?.n)) ? Number(q.n) : null,
      };

      if (type === "matching" || type === "pair" || type === "pairselect") {
        // Strip any leading "1.", "2)", "I.", "(iii)" markers — the app numbers
        // Column A (1,2,3,4) and Column B (I,II,III,IV) automatically.
        out.columnA = arrStr(q?.columnA).map(stripListMarker);
        out.columnB = arrStr(q?.columnB).map(stripListMarker);
      }
      if (type === "statement") {
        // Statements live in columnA (models may also send them as "statements").
        let stmts = arrStr(q?.columnA);
        if (!stmts.length && Array.isArray(q?.statements)) stmts = arrStr(q.statements);
        out.columnA = stmts.map(stripListMarker);
        out.columnB = [];
        if (!out.text) out.text = "Consider the following statements:";
      }
      if (type === "assertion") {
        out.assertion = asStr(q?.assertion).trim();
        out.reason = asStr(q?.reason).trim();
        if (!out.text) out.text = "Consider the following Assertion (A) and Reason (R):";
      }
      if (type === "table") {
        out.tableRows = Array.isArray(q?.tableRows)
          ? q.tableRows.map((row) => arrStr(row))
          : [];
      }
      return out;
    })
    .filter((q) => q.text); // drop empty questions
}

// Spread the correct answer evenly + randomly across A/B/C/D so it isn't always
// option A. Models strongly bias the answer to the first option; this fixes it
// deterministically after the fact. Only free-form option types are shuffled —
// structured types (assertion, matching, statement, pair, pairselect) keep their
// fixed option order, since there the option TEXT carries the meaning.
const SHUFFLE_TYPES = new Set(["mcq", "table"]);
function balanceCorrectOptions(list) {
  const targetIdx = [];
  for (let i = 0; i < list.length; i++) if (SHUFFLE_TYPES.has(list[i].type)) targetIdx.push(i);

  // Build a balanced sequence of destination positions (0,1,2,3,0,1,2,3,…) and
  // Fisher–Yates shuffle it → even distribution AND random order.
  const dests = targetIdx.map((_, n) => n % 4);
  for (let i = dests.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dests[i], dests[j]] = [dests[j], dests[i]];
  }

  targetIdx.forEach((qi, n) => {
    const q = list[qi];
    const from = q.correct;
    const to = dests[n];
    if (from === to || !Array.isArray(q.options) || q.options.length < 4) return;
    // Move the correct option (and its matching explanation) to the target slot.
    const opts = q.options.slice();
    const oe = Array.isArray(q.optionExplanations) ? q.optionExplanations.slice() : ["", "", "", ""];
    [opts[from], opts[to]] = [opts[to], opts[from]];
    [oe[from], oe[to]] = [oe[to], oe[from]];
    q.options = opts;
    q.optionExplanations = oe;
    q.correct = to;
  });
  return list;
}

// Reorder the finished batch so the SAME question type never sits back-to-back
// when avoidable (no run of consecutive MCQs, then all matching, etc.). Each
// type's questions are shuffled and the types are interleaved, so the order is
// fresh and varied on EVERY run. (Adjacency is only unavoidable when a single
// type makes up more than half the batch.)
function reorderNoConsecutiveTypes(list) {
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const groups = new Map();
  for (const q of list) {
    const t = q.type || "mcq";
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(q);
  }
  for (const arr of groups.values()) shuffle(arr); // fresh random order within each type

  const out = [];
  let lastType = null;
  while (out.length < list.length) {
    const buckets = [...groups.entries()].filter(([, arr]) => arr.length > 0);
    let eligible = buckets.filter(([t]) => t !== lastType);
    if (!eligible.length) eligible = buckets; // only the same type remains — unavoidable
    // Prefer the type with the most left (keeps spacing feasible); break ties
    // randomly so the sequence differs every time.
    const maxLeft = Math.max(...eligible.map(([, arr]) => arr.length));
    const top = eligible.filter(([, arr]) => arr.length === maxLeft);
    const [type, arr] = top[Math.floor(Math.random() * top.length)];
    out.push(arr.pop());
    lastType = type;
  }
  return out;
}

const MAX_TOTAL = 50; // most questions per generate request
const CHUNK_SIZE = 12; // questions generated per provider call — smaller so the richer, detailed explanations don't truncate the JSON reply

// Pull a suggested retry wait (ms) out of a 429 response — either the
// Retry-After header or Gemini's RetryInfo "retryDelay":"27s" body field.
function retryWaitMs(headers, body) {
  const ra = parseInt(headers?.get?.("retry-after") || "", 10);
  if (ra > 0) return Math.min(ra * 1000, 20000);
  const m = /"retryDelay"\s*:\s*"?(\d+)s/i.exec(body || "");
  if (m) return Math.min(parseInt(m[1], 10) * 1000, 20000);
  return 0;
}

// One provider call with transient-error retries. Returns { ok, status, content, detail }.
async function callProvider({ key, baseUrl, model, userPrompt, maxTokens, systemPrompt = SYSTEM_PROMPT, temperature = 0.6 }) {
  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };
  // Gemini burns budget on hidden "thinking" which truncates JSON — turn it off
  // (sent only for Gemini; OpenAI/Claude reject this field).
  if (/gemini/i.test(model)) payload.reasoning_effort = "none";

  // 429 is NOT retried here — it returns immediately so the caller can switch to
  // the next configured key. Only "busy" server errors are retried on this key.
  const TRANSIENT = [500, 502, 503, 504];
  const WAITS = [1500, 3000, 6000, 9000];
  const TIMEOUT_MS = 90000; // hard cap per call so a hung provider can't stall the whole job
  for (let attempt = 0; ; attempt++) {
    let resp;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      resp = await fetch(`${(baseUrl || "https://api.tokenlab.sh/v1").replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      // Network error or a timeout (abort). Retry a few times on this key, then
      // give up so the worker moves on to another chunk/key instead of hanging.
      if (attempt < WAITS.length) { await new Promise((r) => setTimeout(r, WAITS[attempt])); continue; }
      return { ok: false, status: 0, detail: err?.name === "AbortError" ? "Request timed out." : (err?.message || "Network error.") };
    }
    clearTimeout(timer);
    if (resp.ok) {
      const data = await resp.json();
      return { ok: true, content: extractContent(data), tokens: data?.usage?.total_tokens || 0 };
    }
    const detail = await resp.text().catch(() => "");
    // Some Gemini model versions reject the `reasoning_effort` field with a 400.
    // Retry once WITHOUT it so a valid key isn't wrongly marked as "not working".
    if (resp.status === 400 && payload.reasoning_effort) {
      delete payload.reasoning_effort;
      continue;
    }
    const canRetry = TRANSIENT.includes(resp.status) && attempt < WAITS.length;
    if (!canRetry) return { ok: false, status: resp.status, detail };
    // For 429 (quota/rate) honour the server's suggested delay; else backoff.
    const wait = resp.status === 429 ? retryWaitMs(resp.headers, detail) || WAITS[attempt] : WAITS[attempt];
    await new Promise((r) => setTimeout(r, wait));
  }
}

// Take a sub-plan of up to `size` questions off the front of a bucket plan.
function takeChunk(planArr, size) {
  const chunk = [];
  let tot = 0;
  for (const b of planArr) {
    if (tot >= size) break;
    const take = Math.min(b.count, size - tot);
    if (take > 0) { chunk.push({ type: b.type, difficulty: b.difficulty, count: take }); tot += take; }
  }
  return chunk;
}

// Given the target plan and what we've collected so far, return the buckets
// still short (so the next chunk targets the gaps). Honours the distribution.
function remainingPlan(planArr, collected) {
  const have = {};
  for (const q of collected) {
    const k = `${q.type}|${q.difficulty}`;
    have[k] = (have[k] || 0) + 1;
  }
  return planArr
    .map((b) => {
      const k = `${b.type}|${b.difficulty}`;
      const used = Math.min(have[k] || 0, b.count);
      have[k] = (have[k] || 0) - used;
      return { ...b, count: b.count - used };
    })
    .filter((b) => b.count > 0);
}

/* ------------------------- Background generation jobs -------------------------
   Big batches (up to 100 questions) are produced across many small provider
   calls. Doing that inside one HTTP request risks proxy timeouts, so instead we
   run the work in the background and let the client poll for progress.
   NOTE: jobs are kept in memory — fine for a single backend instance. They are
   automatically cleaned up after 20 minutes via a periodic interval. */
const genJobs = new Map(); // id -> { status, questions, requested, error, model, updatedAt }

function newJobId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function cleanupJobs() {
  const cutoff = Date.now() - 20 * 60 * 1000; // 20 min
  for (const [id, j] of genJobs) if (j.updatedAt < cutoff) genJobs.delete(id);
}

// Periodically clean up expired jobs every 5 minutes to prevent unbounded
// memory growth (previously cleanup only ran when a new job was started).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(cleanupJobs, CLEANUP_INTERVAL_MS).unref();

// Buckets still short — accounting for BOTH what's collected AND what parallel
// workers currently have reserved (in-flight), so two keys never target the
// same gap at the same time.
function planGaps(planArr, collected, reserved) {
  const have = {};
  for (const q of collected) { const k = `${q.type}|${q.difficulty}`; have[k] = (have[k] || 0) + 1; }
  for (const k in reserved) have[k] = (have[k] || 0) + (reserved[k] || 0);
  return planArr
    .map((b) => {
      const k = `${b.type}|${b.difficulty}`;
      const used = Math.min(have[k] || 0, b.count);
      have[k] = (have[k] || 0) - used;
      return { ...b, count: b.count - used };
    })
    .filter((b) => b.count > 0);
}

async function runGenerationJob(id, ctx) {
  const { workers, model, topic, notes, plan, count, difficulty, types, target, avoid, owner = null, source = "" } = ctx;
  const job = genJobs.get(id);
  const deadline = Date.now() + 8 * 60 * 1000; // overall time budget

  // Spread the work across ALL keys at once. With many keys and a modest target
  // (e.g. 40 questions across 20 keys) each key produces a SMALL batch (~2) so
  // every key runs simultaneously, instead of a few keys doing big 12-question
  // chunks while the rest sit idle. Smaller batches also finish faster and mean
  // one slow/failing key can't stall the whole run.
  const workerCount = Math.max(1, workers?.length || 1);
  const chunkSize = Math.max(1, Math.min(CHUNK_SIZE, Math.ceil(target / workerCount)));

  // Signature of a question (normalised stem) used to guarantee NO duplicates —
  // neither within this batch nor against questions from an earlier batch
  // (the caller passes their stems in `avoid`). This is the reliable no-repeat
  // guarantee; the prompt instruction just reduces wasted regeneration.
  const qSig = (q) => String(q?.text || q || "").toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set((avoid || []).map(qSig).filter(Boolean));
  const avoidForPrompt = (avoid || []).slice(0, 60);
  // Content signatures for semantic-ish de-duplication: catch the SAME fact
  // reworded (not just identical text). Seeded with the already-existing
  // questions so re-runs don't repeat them either.
  const sigList = [];
  for (const s of avoid || []) {
    const tk = contentTokens(s);
    if (tk.size) sigList.push({ tk, ans: "" });
  }
  // Is this question a reworded duplicate of one we already have?
  const isSemanticDup = (q) => {
    const tk = contentTokens(q?.text);
    if (!tk.size) return false;
    const ans = ANSWER_DEDUP_TYPES.has(q?.type) ? correctAnswerNorm(q) : "";
    for (const e of sigList) {
      const j = jaccard(tk, e.tk);
      if (j >= 0.85) return true; // near-identical wording
      if (j >= 0.5 && ans && ans === e.ans) return true; // same fact + same answer, reworded
    }
    sigList.push({ tk, ans });
    return false;
  };
  const MAX_QUOTA_WAITS = 6; // per key: how many per-minute 429s we ride out before retiring it
  const MAX_ATTEMPTS = Math.ceil(target / chunkSize) + 12 + workerCount * MAX_QUOTA_WAITS; // global safety cap
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const collected = [];
  const reserved = {};   // bucket -> reserved count (plan mode)
  let reservedCount = 0; // reserved total (count mode)
  let attempts = 0;
  let lastError = null;

  const save = (patch) => Object.assign(job, patch, { updatedAt: Date.now() });

  // Reserve the next chunk of work so parallel key-workers don't duplicate it.
  const reserveChunk = () => {
    if (plan) {
      const rem = planGaps(plan, collected, reserved);
      if (!rem.length) return null;
      const chunk = takeChunk(rem, chunkSize);
      for (const b of chunk) reserved[`${b.type}|${b.difficulty}`] = (reserved[`${b.type}|${b.difficulty}`] || 0) + b.count;
      return { chunk, n: chunk.reduce((s, b) => s + b.count, 0) };
    }
    const remaining = target - collected.length - reservedCount;
    if (remaining <= 0) return null;
    const n = Math.min(chunkSize, remaining);
    reservedCount += n;
    return { n };
  };
  const release = (res) => {
    if (plan) for (const b of res.chunk) { const k = `${b.type}|${b.difficulty}`; reserved[k] = Math.max(0, (reserved[k] || 0) - b.count); }
    else reservedCount = Math.max(0, reservedCount - res.n);
  };

  // ONE worker PER API KEY → every key generates SIMULTANEOUSLY. Each worker
  // sticks to its own key; when that key hits its per-minute limit (429) it
  // waits it out while the OTHER keys keep producing. This both speeds up big
  // batches and spreads the rate-limit load across all keys at once.
  const worker = async (ep) => {
    let quotaWaits = 0;
    while (collected.length < target && attempts < MAX_ATTEMPTS && Date.now() < deadline) {
      const res = reserveChunk();
      if (!res) break; // nothing left to generate
      const prompt = plan
        ? buildUserPrompt({ topic, notes, plan: res.chunk, avoid: avoidForPrompt, source })
        : buildUserPrompt({ topic, notes, count: res.n, difficulty, types, avoid: avoidForPrompt, source });
      const maxTokens = Math.min(16000, 1800 + res.n * 1000);
      attempts += 1;
      // Higher temperature for generation → more varied questions (extraction
      // stays at the low default so it copies the source faithfully).
      const r = await callProvider({ key: ep.key, baseUrl: ep.baseUrl, model: ep.model || model, userPrompt: prompt, maxTokens, temperature: 0.85 });
      release(res); // free the reservation — any shortfall gets re-targeted next round
      if (r.ok) {
        AiKey.updateOne({ key: ep.key, owner: owner ?? null }, { $inc: { usedRequests: 1, usedTokens: r.tokens || 0 } }).catch(() => {});
        for (const q of normalize(parseQuestions(r.content))) {
          if (collected.length >= target) break;
          const sig = qSig(q);
          if (!sig || seen.has(sig)) continue; // skip blanks + exact duplicates
          if (isSemanticDup(q)) continue; // skip the SAME fact reworded (semantic duplicate)
          seen.add(sig);
          collected.push(q);
        }
        save({ questions: collected.slice() });
        continue;
      }
      lastError = r;
      if ([401, 403].includes(r.status)) break; // key dead/unauthorized — retire
      if (r.status === 404) {
        // The model isn't valid for this key. Auto-find a valid one (once),
        // switch to it, remember it on the key, and retry — so a wrong model id
        // (common with OpenRouter) self-heals instead of failing the whole run.
        if (!ep._repaired) {
          ep._repaired = true;
          const picked = pickPreferredModel(await fetchModels(ep.key, ep.baseUrl));
          if (picked && picked !== ep.model) {
            ep.model = picked;
            AiKey.updateOne({ key: ep.key }, { models: picked }).catch(() => {});
            continue; // retry this chunk with the valid model
          }
        }
        break; // couldn't find a valid model for this key — retire it
      }
      if (r.status === 429) {
        // This key hit its per-minute limit. Wait it out; the other key-workers
        // keep generating in parallel meanwhile.
        if (quotaWaits >= MAX_QUOTA_WAITS) break;
        const waitMs = Math.min(retryWaitMs(null, r.detail) || 30000, 60000);
        if (Date.now() + waitMs >= deadline) break;
        quotaWaits += 1;
        await sleep(waitMs);
      }
      // transient/other errors: loop and try another chunk on this key
    }
  };

  try {
    // Launch every configured key at once — each on a model it supports.
    await Promise.all((workers || []).map((ep) => worker(ep)));

    if (!collected.length) {
      let msg;
      if (lastError?.status === 429) {
        msg =
          "All configured API keys hit their quota/rate limit (429). Free tiers allow only limited requests per minute/day. Add another API key (Admin → AI Keys), wait a minute (or until tomorrow), use a smaller batch, or enable billing on your key.";
      } else if (lastError?.status === 404) {
        msg =
          "The selected AI model isn't available for your key (404). Go to Admin → AI Keys, click 'Show models' on the key to see valid model ids, click one to set it, then pick that model in the generator.";
      } else if (lastError) {
        const busy = lastError.status === 503 ? " The model is busy — try again shortly or pick a different model." : "";
        msg = `AI provider error (${lastError.status}).${busy} ${(lastError.detail || "").slice(0, 200)}`;
      } else {
        msg = "The AI did not return any usable questions. Try again, a simpler topic, or a different model.";
      }
      save({ status: "error", error: msg });
    } else {
      // Finished (possibly short of target if every key's quota ran out). Even out
      // the correct-answer positions across the whole batch before returning.
      // Only flag "quota" when we actually fell short.
      const short = collected.length < target;
      save({ status: "done", questions: balanceCorrectOptions(reorderNoConsecutiveTypes(collected)), error: short && lastError?.status === 429 ? "quota" : null });
    }
  } catch (err) {
    save(collected.length ? { status: "done", questions: balanceCorrectOptions(reorderNoConsecutiveTypes(collected)) } : { status: "error", error: err?.message || "AI request failed." });
  }
}

// POST /api/ai/generate  (admin)
// Body: { topic, notes, model, plan:[{type,difficulty,count}] }  (or legacy { count, difficulty, types })
// Starts a background job and returns { jobId, requested }. Poll /api/ai/job/:id.
export async function generateQuestions(req, res) {
  const scope = resolveScope(req.user, req.body?.mode);
  if (scope.denied) {
    return res.status(403).json({ message: "AI access is not enabled for your account. Please contact the administrator." });
  }
  const chosen = await resolveModel(String(req.body?.model || "").trim(), scope);
  if (!chosen || !chosen.endpoints.length) {
    return res.status(400).json({
      message:
        scope.mode === "self"
          ? "No API keys added yet. Go to the AI tab, choose “Use my own API keys”, and add at least one key."
          : "AI is not configured. Add an API key in Admin → AI Keys, or set AI_API_KEY on the server.",
    });
  }
  const { model } = chosen;

  // Build one worker per ENABLED key so they ALL generate simultaneously. A key
  // that serves the chosen model uses it; any other key uses its own first model
  // — so every available key contributes, not just those on the selected model.
  const workers = (await providers(scope)).map((p) => ({
    key: p.key,
    baseUrl: p.baseUrl,
    model: p.models.includes(model) ? model : (p.models[0] || model),
  }));

  // Optional SOURCE MATERIAL: a pasted paragraph and/or a page URL to generate
  // questions FROM. When present, a topic is not required (we derive one).
  const genUrl = String(req.body?.url || "").trim();
  let source = String(req.body?.source || "").trim();
  if (genUrl) {
    if (!/^https?:\/\//i.test(genUrl)) {
      return res.status(400).json({ message: "Enter a valid http(s) URL, or paste the text instead." });
    }
    const page = await fetchPageText(genUrl);
    if (!page.ok) {
      return res.status(502).json({
        message: `Couldn't read that page${page.status ? ` (HTTP ${page.status})` : ""}. ${page.error || "The site may block automated access — paste the text instead."}`,
      });
    }
    source = `${source}\n\n${page.text}`.trim();
  }
  if (source) source = source.slice(0, 24000); // cap material sent on each call

  let topic = String(req.body?.topic || "").trim();
  if (!topic) topic = source ? "the provided source material" : "";
  if (!topic) return res.status(400).json({ message: "A topic is required (or provide source material)." });

  const notes = String(req.body?.notes || "").trim();

  // Explicit per-bucket plan — sanitized and capped at MAX_TOTAL. Falls back to
  // the legacy count/difficulty/types path when no plan is provided.
  let plan = null;
  if (Array.isArray(req.body?.plan)) {
    plan = req.body.plan
      .filter((b) => b && TYPES.includes(b.type) && DIFFS.includes(b.difficulty))
      .map((b) => ({ type: b.type, difficulty: b.difficulty, count: Math.max(0, parseInt(b.count, 10) || 0) }))
      .filter((b) => b.count > 0);
    let running = 0;
    plan = plan
      .map((b) => {
        const c = Math.min(b.count, Math.max(0, MAX_TOTAL - running));
        running += c;
        return { ...b, count: c };
      })
      .filter((b) => b.count > 0);
    if (!plan.length) plan = null;
  }

  const count = Math.min(MAX_TOTAL, Math.max(1, parseInt(req.body?.count, 10) || 5));
  const difficulty = req.body?.difficulty;
  const types = Array.isArray(req.body?.types)
    ? req.body.types.filter((t) => TYPES.includes(t))
    : [];

  const target = plan ? plan.reduce((s, b) => s + b.count, 0) : count;

  cleanupJobs();
  const id = newJobId();
  genJobs.set(id, {
    status: "pending",
    questions: [],
    requested: target,
    error: null,
    model,
    updatedAt: Date.now(),
  });

  // Stems of questions that already exist (from earlier batches) — the generator
  // must not repeat these. Capped to keep the request reasonable.
  const avoid = Array.isArray(req.body?.avoid)
    ? req.body.avoid.filter((s) => typeof s === "string" && s.trim()).slice(0, 300)
    : [];

  // Fire-and-forget — the client polls /api/ai/job/:id for progress.
  runGenerationJob(id, { workers, model, topic, notes, plan, count, difficulty, types, target, avoid, owner: scope.owner, source });

  res.json({ jobId: id, requested: target, model });
}

// GET /api/ai/job/:id  (admin) — poll generation progress.
export function jobStatus(req, res) {
  const job = genJobs.get(req.params.id);
  if (!job) return res.status(404).json({ message: "Job not found or expired." });
  res.json({
    status: job.status, // pending | done | error
    count: job.questions.length,
    requested: job.requested,
    chunksTotal: job.chunksTotal, // for import jobs (source split into pieces)
    chunksDone: job.chunksDone,
    model: job.model,
    error: job.error,
    questions: job.status === "done" ? job.questions : undefined,
  });
}


/* --------------------- Import questions from a website / text ---------------------
   The admin pastes a page URL and/or the copied text; the AI EXTRACTS the
   questions already present and returns them in the app schema for preview. */

const MAX_SOURCE_CHARS = 400000; // overall cap on pasted/fetched material
// Smaller pieces per call so the JSON reply (which lists many questions) does
// not hit the model's output-token limit and get truncated — truncation was
// silently dropping the tail questions of every chunk.
const SOURCE_CHUNK_CHARS = 6000; // size of each piece sent to the model per call
const SOURCE_CHUNK_OVERLAP = 500; // repeat a little of the previous piece so a question split across a boundary is still captured whole (duplicates are removed later)

// Split large source text into chunks, breaking on natural boundaries so a
// question isn't cut in half. Handles multi-section pages in one import. Each
// piece overlaps the previous one slightly so boundary questions aren't lost.
function splitSource(text, size) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const brk = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
      if (brk > size * 0.5) end = i + brk + 1;
    }
    chunks.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = Math.max(end - SOURCE_CHUNK_OVERLAP, i + 1); // step back for overlap, but always move forward
  }
  return chunks.filter(Boolean);
}

// Number of questions to send to the model per call (user-requested batch size).
const QUESTIONS_PER_CHUNK = 20;
// Safety ceiling so a batch of long questions can't grow big enough to truncate
// the model's JSON reply (which would drop questions — the very bug we fixed).
const QUESTION_CHUNK_MAX_CHARS = 14000;

// Detect numbered questions in the source and group them into batches of
// ~QUESTIONS_PER_CHUNK. This makes each AI call handle a predictable number of
// questions (20, 20, …) instead of a blind character slice. Returns
// { count, chunks } or null when no reliable numbering is found (caller then
// falls back to character-based splitting).
function splitByQuestions(text, perChunk = QUESTIONS_PER_CHUNK) {
  // Line-start markers like "1.", "12)", "Q3.", "Q.4", "Question 5:".
  const re = /(^|\n)[ \t]*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})[.)\]:]\s/gi;
  const marks = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    marks.push({ pos: m.index + (m[1] ? m[1].length : 0), num: parseInt(m[2], 10) });
  }
  // Keep a sequential chain (1,2,3,…) so stray numbers / numbered options aren't
  // mistaken for question starts. Allow a reset to 1 for multi-section papers.
  const starts = [];
  let prev = null;
  for (const mk of marks) {
    if (prev === null) {
      if (mk.num <= 3) { starts.push(mk.pos); prev = mk.num; } // begin near the first question
    } else if (mk.num === prev + 1 || mk.num === 1) {
      starts.push(mk.pos);
      prev = mk.num;
    }
  }
  if (starts.length < 2) return null; // no reliable numbering — fall back

  // One text block per detected question.
  const blocks = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    const block = text.slice(starts[i], end).trim();
    if (block) blocks.push(block);
  }

  // Group into batches of `perChunk`, but start a new batch early if adding the
  // next question would exceed the char ceiling.
  const chunks = [];
  let cur = [];
  let curChars = 0;
  for (const b of blocks) {
    if (cur.length && (cur.length >= perChunk || curChars + b.length > QUESTION_CHUNK_MAX_CHARS)) {
      chunks.push(cur.join("\n\n"));
      cur = [];
      curChars = 0;
    }
    cur.push(b);
    curChars += b.length + 2;
  }
  if (cur.length) chunks.push(cur.join("\n\n"));
  return { count: blocks.length, chunks };
}

// Hard filter so ONLY genuine questions survive extraction — never headers,
// footers, reference/file numbers, exam-centre/hall names, instructions, marks,
// time, roll-number fields, invigilator/signature lines, page markers, etc.
const EXTRACT_JUNK = [
  /file\s*no[.:]/i,
  /generated\s+from\s+\w*office/i,
  /\bcomputer\s*no\b/i,
  /\d{3,}\s*\/\s*\d{2,4}\s*\/\s*\d+\s*\/\s*\d+/, // reference no. like 8233675/2026/0/0
  /(maximum|max\.?|total)\s+marks|marks\s*[:=]/i,
  /\btime\s*(allowed|:|=)|\bduration\b/i,
  /\broll\s*(no|number)\b/i,
  /\b(invigilator|signature|candidate'?s?\s+name)\b/i,
  /read\s+the\s+following\s+instructions|do\s+not\s+open|rough\s+work|instructions\s+to\s+candidates/i,
  /\bp\.?\s*t\.?\s*o\.?\b/i,
  /service\s+selection\s+board/i,
];

function isRealQuestion(q) {
  const text = String(q?.text || "").trim();
  if (!text) return false;
  if (EXTRACT_JUNK.some((re) => re.test(text))) return false; // obvious boilerplate
  // Every supported question type carries answer options; headers/instructions
  // do not. Require at least 2 real options + a non-trivial stem.
  const opts = (Array.isArray(q.options) ? q.options : []).map((o) => String(o || "").trim()).filter(Boolean);
  if (opts.length < 2) return false;
  if (text.replace(/[^a-z0-9]/gi, "").length < 5) return false; // too short to be a question
  return true;
}

// Signature to de-duplicate questions collected across chunks/sections. Strips
// ALL non-alphanumerics and sorts the options/columns so the SAME question
// extracted twice (with minor whitespace/punctuation/order differences from the
// chunk overlap or OCR) collapses to one — fixing over-counts like 80 -> 84.
// Options are still part of the key so distinct questions that share a generic
// stem ("Which of the following is correct?") are NOT wrongly merged.
function extractSig(q) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const stem = norm(q.text).slice(0, 200);
  const opts = (Array.isArray(q.options) ? q.options : []).map(norm).filter(Boolean).sort().join("|");
  const cols = [...(q.columnA || []), ...(q.columnB || [])].map(norm).filter(Boolean).sort().join("|");
  return `${stem}##${opts}##${cols}`;
}

// Fetch a web page and reduce it to readable plain text.
async function fetchPageText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // A normal browser UA — some sites reject unknown clients.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return { ok: false, status: resp.status };
    const html = await resp.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ") // strip tags
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "The page took too long to load." : e?.message };
  } finally {
    clearTimeout(timer);
  }
}

function buildExtractPrompt(sourceText, notes = "") {
  const instr = String(notes || "").trim();
  return [
    'You extract questions from an exam/quiz document. Return ONLY JSON: {"questions":[...]}.',
    ...(instr
      ? ["", `======================\nMANDATORY USER INSTRUCTIONS (HIGHEST PRIORITY)\nThe user gave these instructions — follow them EXACTLY while extracting (e.g. only keep questions on a given topic, translate/clean wording, fix obvious OCR typos, set difficulty, etc.). They OVERRIDE any conflicting rule below:\n${instr}\n======================`]
      : []),
    "",
    "MOST IMPORTANT: capture EVERY question in the material below — do not skip, summarise or merge any. If the text contains 40 questions, return all 40, in their original order.",
    "Equally important: do NOT invent questions, do NOT repeat/duplicate a question, and do NOT split one question (or its sub-parts/options) into multiple questions. The number you return must NOT exceed the number actually present in the text.",
    "The source questions are NUMBERED (1, 2, 3, …). For EACH question, include its exact source number as an integer field \"n\". Return EXACTLY ONE object per numbered question — if the text has questions numbered up to 50, return 50 objects with n = 1..50. Never merge two numbers into one object and never split one number into two.",
    "Write any mathematical or numerical content as INLINE MATH using $…$ (LaTeX) inside \"text\" and \"options\": equations, fractions, exponents/powers, roots, ratios, percentages, and the numbers used in quantitative questions. Examples: $2^{10}\\times5^{8}$, $\\frac{3}{4}$, $x\\%$ of $y$, $45678x9231$, $\\sqrt{2}$. (Numbers that are just part of ordinary prose need not be wrapped.)",
    "NEVER use the \"$\" character for money/currency — \"$\" is reserved only for wrapping math, and a stray \"$\" (e.g. \"$300\") corrupts rendering. Write money as \"300 dollars\"/\"900 rupees\"/just the number.",
    "",
    "Output ONLY actual questions — NOTHING else. A valid question has a stem AND answer options. IGNORE and never output: titles, headings, exam/booklet names, exam-centre or hall names (e.g. \"Clerical Hall JKSSB\"), file/reference/computer numbers (e.g. \"8233675/2026/0/0\", \"File No. …\"), page numbers, \"Set-A\", \"P.T.O.\", maximum marks, time/duration, roll-number/candidate fields, invigilator or signature lines, general instructions, section headers, and watermarks. If a line or block is not a real question with options, drop it entirely.",
    "",
    "If a reading PASSAGE / paragraph is given before a group of questions (comprehension), prepend the relevant passage text to the \"text\" of each of those questions so each question is self-contained; do NOT output the passage on its own as a question.",
    "",
    "Reproduce each question exactly as written (same wording, same options). For each one set:",
    '- "text": the full question stem, verbatim.',
    '- "type": choose the type that matches how the question actually looks:',
    '    • "assertion" — an Assertion (A) and Reason (R) pair → put them in "assertion" and "reason".',
    '    • "statement" — a "consider the following statements" question → put each statement verbatim in "columnA" (array).',
    '    • "matching" — match Column A with Column B. Put Column A entries (WITHOUT labels) in "columnA" — the app shows them as 1,2,3,4 — and Column B entries in "columnB" — the app shows them as I,II,III,IV. Each of the 4 "options" must be a full A→B mapping using EXACTLY those labels, e.g. "1-III, 2-I, 3-IV, 4-II". Never put a/b/c/d inside an option and never relabel a column.',
    '    • "table" — data laid out as a table → each row as an array inside "tableRows".',
    '    • "mcq" — everything else: ordinary multiple choice, true/false, fill-in-the-blank, numerical/integer-answer, etc.',
    '- "options": the answer choices exactly as printed (4 for MCQ). For true/false use ["True","False","",""]. If more than 4 are printed, keep the 4 real ones. If the source genuinely has no printed options, give the most sensible 4.',
    '- "correct": 0-based index of the right option. For NUMERICAL questions, COMPUTE the answer yourself using the correct formula (formula → substitute values → result) and pick the option equal to YOUR result even if the source answer key differs (keys can be wrong). For matching/pair/statement questions, check each item and pick the option matching the true count. Otherwise use the source answer key (bold, "Ans", tick) or your best answer.',
    '- "explanation": keep it to ONE short sentence — EXCEPT for numerical questions, where you give the brief formula-based working (formula → substitution → result) that leads to the marked option.',
    "",
    "Keep everything BRIEF — do NOT write per-option notes or long explanations. Verbose output makes questions get cut off and lost, which must not happen.",
    "",
    "SOURCE MATERIAL:",
    sourceText,
  ].join("\n");
}

// Background worker: extract questions from every source chunk and combine
// (de-duplicated), so a multi-section page is imported in one go.
// `have` = questions the caller ALREADY has (from a first pass). We seed the
// de-dup set with them so a re-run collects ONLY the ones that were missed —
// this powers the "Extract remaining" button (e.g. got 68 of 80, fetch the
// other 12 without duplicates).
async function runExtractionJob(id, { endpoints, model, chunks, owner = null, have = [], notes = "" }) {
  const job = genJobs.get(id);
  const deadline = Date.now() + 8 * 60 * 1000; // 8-minute budget (smaller chunks = more calls)
  const collected = [];
  const seen = new Set();
  // Seed the de-dup set with the already-extracted questions so they are skipped.
  // Numbered papers de-dup by source number (n:<num>) — stable across re-runs;
  // otherwise by the fuzzy content signature.
  for (const nq of normalize(Array.isArray(have) ? have : [])) {
    seen.add(nq.n != null ? `n:${nq.n}` : extractSig(nq));
  }
  let lastError = null;

  const save = (patch) => Object.assign(job, patch, { updatedAt: Date.now() });

  try {
    for (let c = 0; c < chunks.length; c++) {
      if (Date.now() > deadline) break;
      const r = await callWithFallback({
        endpoints,
        model,
        userPrompt: buildExtractPrompt(chunks[c], notes),
        maxTokens: 16000,
        owner,
      });
      save({ chunksDone: c + 1 });
      if (!r.ok) {
        lastError = r;
        if (r.status === 429) break; // quota exhausted — stop, keep what we have
        continue;
      }
      for (const q of normalize(parseQuestions(r.content))) {
        if (!isRealQuestion(q)) continue; // keep ONLY genuine questions — drop headers/instructions/etc.
        // For numbered papers, de-duplicate by the SOURCE question number so the
        // count matches exactly (no duplicate/split inflation). Fall back to the
        // fuzzy text signature when there's no reliable number.
        const key = q.n != null ? `n:${q.n}` : extractSig(q);
        if (seen.has(key)) continue; // skip duplicates across chunks
        seen.add(key);
        collected.push(q);
      }
      save({ questions: collected.slice() });
    }

    if (!collected.length) {
      const msg =
        lastError?.status === 429
          ? "Gemini quota/rate limit reached before any questions were extracted. Wait a minute or use a different model."
          : lastError
          ? `AI provider error (${lastError.status}). ${(lastError.detail || "").slice(0, 200)}`
          : "No questions could be extracted. Make sure the source actually contains questions.";
      save({ status: "error", error: msg });
    } else {
      save({ status: "done", questions: collected, error: lastError?.status === 429 ? "quota" : null });
    }
  } catch (err) {
    save(collected.length ? { status: "done", questions: collected } : { status: "error", error: err?.message || "Import failed." });
  }
}

// POST /api/ai/extract  (admin)
// Body: { url?, content?, model? } — starts a background import job over the
// whole source (all sections) and returns { jobId }. Poll /api/ai/job/:id.
export async function extractQuestions(req, res) {
  const scope = resolveScope(req.user, req.body?.mode);
  if (scope.denied) {
    return res.status(403).json({ message: "AI access is not enabled for your account. Please contact the administrator." });
  }
  const chosen = await resolveModel(String(req.body?.model || "").trim(), scope);
  if (!chosen || !chosen.endpoints.length) {
    return res.status(400).json({
      message:
        scope.mode === "self"
          ? "No API keys added yet. Go to the AI tab, choose “Use my own API keys”, and add at least one key."
          : "AI is not configured. Add an API key in Admin → AI Keys.",
    });
  }
  const { model, endpoints } = chosen;
  const url = String(req.body?.url || "").trim();
  let content = String(req.body?.content || "").trim();

  if (url) {
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: "Enter a valid http(s) URL, or paste the text instead." });
    }
    const page = await fetchPageText(url);
    if (!page.ok) {
      return res.status(502).json({
        message: `Couldn't read that page${page.status ? ` (HTTP ${page.status})` : ""}. ${
          page.error || "The site may block automated access — try copying the questions text and pasting it instead."
        }`,
      });
    }
    content = `${content}\n\n${page.text}`.trim();
  }

  if (!content) {
    return res.status(400).json({ message: "Provide a page URL or paste the questions text to import." });
  }

  const source = content.slice(0, MAX_SOURCE_CHARS);
  // First figure out how many questions the source contains and split it into
  // batches of ~20 questions each. If numbering can't be detected reliably,
  // fall back to character-based splitting.
  const detected = splitByQuestions(source);
  const chunks = detected ? detected.chunks : splitSource(source, SOURCE_CHUNK_CHARS);

  cleanupJobs();
  const id = newJobId();
  genJobs.set(id, {
    status: "pending",
    questions: [],
    requested: detected?.count || null, // detected question count (when known)
    chunksTotal: chunks.length,
    chunksDone: 0,
    error: null,
    model,
    updatedAt: Date.now(),
  });

  // Already-extracted questions from a previous pass (for "Extract remaining") —
  // they seed the de-dup set so only the missed questions come back. Capped.
  const have = Array.isArray(req.body?.have) ? req.body.have.slice(0, 500) : [];
  // Optional strong user instructions to steer extraction.
  const notes = String(req.body?.notes || "").trim();

  runExtractionJob(id, { endpoints, model, chunks, owner: scope.owner, have, notes });
  res.json({ jobId: id, chunks: chunks.length, questionsDetected: detected?.count || 0, model });
}


/* --------------------------- Study notes generation --------------------------- */

const NOTES_SYSTEM_PROMPT = `You are an expert teacher who writes concise, exam-ready STUDY NOTES.
Output PLAIN TEXT using light Markdown ONLY — no HTML, no code fences:
- "# " for the main title, "## " for sections, "### " for sub-sections.
- "- " for bullet points; keep each bullet short and factual.
- **bold** for key terms; ==highlight== for the single most important facts/definitions.
- Prefer short lines and clear structure over long paragraphs.
- Include key dates, formulas, definitions and short examples where relevant.
- Whenever a term/place/concept has a common local or alternative name, add it in brackets.
Write mathematical/numeric content as inline math between $...$ (LaTeX).
NEVER use the "$" sign for money/currency (write "300 dollars"/"900 rupees"/just the number) — "$" is reserved only for wrapping math and a stray "$" corrupts rendering.
Return ONLY the notes — no preamble, no closing remarks.`;

function buildNotesPrompt({ topic, notes }) {
  const lines = [
    `Write clear, well-structured revision STUDY NOTES on: ${topic}.`,
    "Organise them with a title, sections and short bullet points covering the important points a student needs to revise.",
  ];
  if (notes) lines.push(`Extra instructions: ${notes}`);
  return lines.join("\n");
}

// POST /api/ai/notes — generate study notes (Markdown text) on a topic.
export async function generateNotes(req, res) {
  const scope = resolveScope(req.user, req.body?.mode);
  if (scope.denied) return res.status(403).json({ message: "AI access is not enabled for your account. Please contact the administrator." });
  const chosen = await resolveModel(String(req.body?.model || "").trim(), scope);
  if (!chosen || !chosen.endpoints.length) {
    return res.status(400).json({
      message: scope.mode === "self"
        ? "No API keys added yet. Add at least one key in the AI tab."
        : "AI is not configured. Add an API key in Admin → AI Keys.",
    });
  }
  const topic = String(req.body?.topic || "").trim();
  if (!topic) return res.status(400).json({ message: "A topic is required." });
  const notes = String(req.body?.notes || "").trim();

  const r = await callWithFallback({
    endpoints: chosen.endpoints,
    model: chosen.model,
    systemPrompt: NOTES_SYSTEM_PROMPT,
    userPrompt: buildNotesPrompt({ topic, notes }),
    maxTokens: 4000,
    owner: scope.owner,
  });
  if (!r.ok) {
    const msg = r.status === 429
      ? "AI quota/rate limit reached. Wait a minute and try again."
      : `AI provider error (${r.status || 0}). ${(r.detail || "").slice(0, 150)}`;
    return res.status(502).json({ message: msg });
  }
  const text = String(r.content || "")
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!text) return res.status(502).json({ message: "The AI did not return any notes. Try a more specific topic." });
  res.json({ notes: text, model: chosen.model });
}


/* --------------------- Extend explanations (bulk, in place) ---------------------
   Rewrites the explanation + per-option notes of EVERY question in one quiz or
   test — without changing the question, options or correct answer. Runs as a
   background job (reuses genJobs/jobStatus) so big quizzes don't time out. */

const EXTEND_SYSTEM_PROMPT = `You are an expert exam teacher. You are given ONE existing exam question (its stem, options, the CORRECT option, its type, and any columns/assertion/reason). Your ONLY job is to write a richer, clearer EXPLANATION and per-option notes for it.

CRITICAL — you MUST ALWAYS respond, for EVERY question, with ONE single valid JSON object and NOTHING else: no markdown, no code fences, no text before or after. The exact shape is:
{"explanation":"...","optionExplanations":["","","",""]}
(For a NUMERICAL question whose stored answer turns out wrong, ALSO include "correct":<0-3>, and, if an option value itself must change, "options":["A","B","C","D"] — see the NUMERICAL rules below.)
JSON VALIDITY RULES (follow exactly or the answer is discarded):
- Escape any double quote inside a string as \\". You MAY use normal line breaks inside the strings for readability.
- MATH: write ALL mathematical/numeric content (equations, fractions, powers, roots, ratios, %) as inline LaTeX between single dollar signs — e.g. $x^2+2x-3=0$, $\\frac{3}{4}$, $2^{10}\\times5^{8}$, $\\sqrt{2}$. This ALSO includes every numeric ANSWER value in "optionExplanations" and any option value you return — wrap numbers/expressions in $...$ so they render as math (e.g. "$12.5$", "$\\frac{180}{13}$", "$25\\%$"). Do NOT use \\( \\) or \\[ \\] delimiters and do NOT write bare LaTeX outside dollar signs.
- CURRENCY: NEVER use the "$" character for money or amounts — "$" is RESERVED solely for opening/closing math, and a stray "$" (e.g. "$300") corrupts the rendering of the ENTIRE explanation. Write money as a plain number with the currency word AFTER it, e.g. "300 dollars", "900 rupees", or just "300". The only "$" characters allowed are the matched pairs that wrap math.
- Do NOT use markdown (no **bold**, no bullet characters), no code fences, no trailing commas.
- Never refuse and never return an empty object — always produce a full explanation.

Content rules:
- "explanation": a THOROUGH, self-contained explanation of the correct answer (3-6 sentences). Include EVERY relevant supporting fact — exact dates/years, historical background, definitions, full formulas WITH the actual calculation, laws/theorems/principles by name, and cause-and-effect reasoning. Teach the concept as if to someone seeing it for the first time; never just restate the option. Put each sentence or distinct point on its OWN line (a real line break between points), not one long paragraph.
- LOCAL / ALTERNATIVE NAMES: whenever a term/place/concept/person/disease/chemical/unit/law has a common local or vernacular (Hindi/regional) name, synonym, abbreviation's full form or old name, add it in brackets right after it.
- "optionExplanations": an array of EXACTLY 4 strings, one per option. For EACH option state clearly whether it is correct or incorrect and WHY (for a wrong numeric option, show what mistake produces that value). Keep each to 1-2 short sentences. Leave the truly-CORRECT option's entry an empty string "".
NUMERICAL / QUANTITATIVE QUESTIONS — you MUST verify by SOLVING, not just describe:
- Solve the problem yourself from scratch. In "explanation" show the working STEP BY STEP: state the formula, substitute the actual values, and show each intermediate result on its OWN line, ending with the final computed value. Every arithmetic step must be correct and lead exactly to the answer you choose.
- Compare your computed value with the four options and decide which option is TRULY correct.
- If your verified correct option DIFFERS from the given CORRECT answer, the stored answer is wrong — return the corrected 0-based index as "correct" (0=A, 1=B, 2=C, 3=D).
- If the correct value is NOT present among the options (or an option's value is numerically wrong), return a corrected "options" array of EXACTLY 4 values that INCLUDES your computed correct value, keep the other three as plausible distractors in the same style/units, and set "correct" to the index of the right value.
- Re-check your arithmetic before responding; the steps shown in "explanation" must match the option you mark correct.
MATCHING / PAIR / STATEMENT questions ("match the columns", "how many pairs are correctly matched", "which statements are correct"):
- Evaluate EACH pair / statement / match INDIVIDUALLY in the explanation: say whether it is correctly matched or true, and if not, give the CORRECT match/characteristic. (Item i in Column A pairs with item i in Column B.)
- Then COUNT how many are correct and choose the option that states that exact count/combination.
- If your verified count/combination DIFFERS from the marked answer, return the corrected "correct" index.
- If NO option matches the true answer (e.g. ZERO pairs are correctly matched but there is no "None" option), return a corrected "options" array of EXACTLY 4 that INCLUDES the right choice (e.g. "None of the pairs are correctly matched") and set "correct" to its index.
STRICT: Do NOT change the question's wording or meaning, and do NOT invent a different question. You MAY fix the "correct" index and option VALUES ONLY when your explicit verification (step-by-step calculation, or a pair-by-pair / statement-by-statement check) proves the stored answer is wrong — otherwise omit "correct"/"options" and leave them unchanged. Return ONLY the JSON object.`;

const EXT_LETTERS = ["A", "B", "C", "D"];
const toRomanLite = (n) => { const m = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]]; let r = ""; for (const [s, v] of m) while (n >= v) { r += s; n -= v; } return r; };

function buildExtendPrompt(q, notes) {
  const lines = [`Question type: ${q.type || "mcq"}`];
  if (q.text) lines.push(`Question: ${q.text}`);
  if (q.assertion) lines.push(`Assertion (A): ${q.assertion}`);
  if (q.reason) lines.push(`Reason (R): ${q.reason}`);
  if (Array.isArray(q.columnA) && q.columnA.length) lines.push(`Column A: ${q.columnA.map((x, i) => `${i + 1}. ${x}`).join("  |  ")}`);
  if (Array.isArray(q.columnB) && q.columnB.length) lines.push(`Column B: ${q.columnB.map((x, i) => `${toRomanLite(i + 1)}. ${x}`).join("  |  ")}`);
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length) lines.push(`Options:\n${opts.map((o, i) => `${EXT_LETTERS[i] || i}) ${o}`).join("\n")}`);
  if (typeof q.correct === "number" && opts[q.correct] != null) lines.push(`CORRECT answer: ${EXT_LETTERS[q.correct]}) ${opts[q.correct]}`);
  if (q.explanation) lines.push(`Existing explanation (improve and expand it — keep anything correct): ${q.explanation}`);
  if (notes) lines.push(`MANDATORY user instructions (follow EXACTLY): ${notes}`);
  lines.push(`Write a THOROUGH "explanation" and verify EACH of the 4 "optionExplanations" (state whether each option is correct or wrong and why). If this is a numerical/quantitative question, SOLVE it yourself step by step — put each calculation step on its own line in the explanation — then check which option is truly correct. If this is a matching / "how many pairs are correctly matched" / statement question, evaluate EACH pair or statement one by one and COUNT the correct ones. In either case, if the marked CORRECT answer is wrong, return the corrected "correct" index (0-3); if a value is wrong or no option matches the true answer (e.g. zero pairs match but there is no "None" option), return a fixed "options" array of 4 that includes the right choice. Do NOT change the question's wording. Write any math as inline LaTeX between $...$ (never \\( \\) or \\[ \\]). Return ONLY one valid JSON object.`);
  return lines.join("\n");
}

// Escape RAW control chars (real newlines/tabs) that appear INSIDE JSON string
// literals — the #1 reason a model's JSON fails to parse, since we ask for
// multi-line explanations and models often press Enter instead of writing \\n.
function escapeRawControlCharsInStrings(t) {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === "\\") { out += c; esc = true; continue; }
      if (c === '"') { out += c; inStr = false; continue; }
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") { out += "\\r"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
      out += c;
    } else {
      out += c;
      if (c === '"') inStr = true;
    }
  }
  return out;
}

// Models very often emit LaTeX with SINGLE backslashes inside JSON strings —
// e.g. they write "\frac" / "\times" / "\text" instead of the JSON-legal
// "\\frac". JSON.parse then interprets "\f"→form-feed, "\t"→tab, "\b"→backspace,
// silently DESTROYING the command ("\frac"→"<FF>rac", "\times"→"<TAB>imes",
// "\text"→"<TAB>ext"). This is the #1 cause of garbled math in explanations.
//
// We repair it BEFORE parsing: inside every JSON string literal, DOUBLE any
// backslash that begins a LaTeX command (backslash + letter, or backslash + a
// LaTeX symbol such as %, {, }, ^, _), while leaving genuine JSON escapes
// (\" \\ \/ \uXXXX, and control escapes \b\f\n\r\t NOT followed by a letter)
// untouched. Runs before escapeRawControlCharsInStrings.
function escapeLatexBackslashes(t) {
  const s = String(t || "");
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inStr) {
      out += c;
      if (c === '"') inStr = true;
      continue;
    }
    if (c !== "\\") {
      out += c;
      if (c === '"') inStr = false;
      continue;
    }
    // Backslash inside a string literal — decide keep vs. double.
    const n = s[i + 1];
    if (n === undefined) { out += "\\\\"; continue; }
    // Genuine JSON escapes that must stay as-is.
    if (n === '"' || n === "\\" || n === "/") { out += "\\" + n; i += 1; continue; }
    // \uXXXX unicode escape — only when followed by exactly 4 hex digits.
    if (n === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) { out += "\\u"; i += 1; continue; }
    // \b \f \n \r \t: a real control escape ONLY when NOT followed by a letter.
    // Followed by a letter it is really a LaTeX command (\beta, \frac, \nu,
    // \rho, \text, \times) whose first char collides with a JSON escape char.
    if ("bfnrt".includes(n) && !/[a-zA-Z]/.test(s[i + 2] || "")) { out += "\\" + n; i += 1; continue; }
    // Everything else is a LaTeX backslash → double it so JSON.parse yields a
    // single literal backslash. Leave the next char for the normal loop.
    out += "\\\\";
  }
  return out;
}

// Apply both JSON repairs (LaTeX backslashes, then raw control chars).
const repairJson = (t) => escapeRawControlCharsInStrings(escapeLatexBackslashes(t));

// Last resort: pull the "explanation" (and optionExplanations) out with regex,
// even from broken or truncated JSON.
function salvageExplanation(t) {
  // Prefer a fully-terminated explanation string; if the reply was truncated
  // mid-explanation (no closing quote), grab everything after the key so a long
  // answer that ran past the token limit is still recovered.
  let m = t.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) m = t.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)$/);
  if (!m) return null;
  let explanation = "";
  try { explanation = JSON.parse(`"${m[1]}"`); } catch { explanation = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'); }
  explanation = String(explanation).trim();
  if (!explanation) return null;
  let oe = null;
  const am = t.match(/"optionExplanations"\s*:\s*\[([\s\S]*?)\]/);
  if (am) { try { oe = JSON.parse(`[${am[1]}]`).map((x) => (x == null ? "" : String(x))); } catch { oe = null; } }
  return { explanation, optionExplanations: oe };
}

// Robustly pull { explanation, optionExplanations } from the model's text.
function parseExplanationJson(content) {
  let t = String(content || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Narrow to the outermost object if there's stray text around it.
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  const slice = s !== -1 && e > s ? t.slice(s, e + 1) : t;

  let obj = null;
  for (const candidate of [t, slice, repairJson(t), repairJson(slice)]) {
    try { obj = JSON.parse(candidate); break; } catch { /* try next */ }
  }

  if (obj && typeof obj === "object") {
    const explanation = typeof obj.explanation === "string" ? obj.explanation.trim() : "";
    let oe = Array.isArray(obj.optionExplanations) ? obj.optionExplanations.map((x) => (x == null ? "" : String(x))) : null;
    if (oe) { oe = oe.slice(0, 4); while (oe.length < 4) oe.push(""); }
    // Optional numerical-correction fields: a corrected 0-based answer index and
    // a corrected 4-option array (only present when the AI's working proves the
    // stored answer wrong). Accept a number, a "0".."3" string, or a letter A-D.
    let correct = null;
    const rc = obj.correct;
    if (typeof rc === "number" && Number.isInteger(rc)) correct = rc;
    else if (typeof rc === "string" && /^[0-3]$/.test(rc.trim())) correct = parseInt(rc.trim(), 10);
    else if (typeof rc === "string" && /^[A-Da-d]$/.test(rc.trim())) correct = rc.trim().toUpperCase().charCodeAt(0) - 65;
    if (correct != null && (correct < 0 || correct > 3)) correct = null;
    const options = Array.isArray(obj.options) && obj.options.length === 4
      ? obj.options.map((x) => (x == null ? "" : String(x)))
      : null;
    // Optional re-wrapped stem/columns (used by Regenerate to fix math rendering
    // in the question itself — same meaning, math wrapped in $...$). Extend
    // ignores these.
    const text = typeof obj.text === "string" && obj.text.trim() ? obj.text.trim() : null;
    const columnA = Array.isArray(obj.columnA) ? obj.columnA.map((x) => (x == null ? "" : String(x))) : null;
    const columnB = Array.isArray(obj.columnB) ? obj.columnB.map((x) => (x == null ? "" : String(x))) : null;
    const tableRows = Array.isArray(obj.tableRows) && obj.tableRows.every((r) => Array.isArray(r))
      ? obj.tableRows.map((r) => r.map((c) => (c == null ? "" : String(c))))
      : null;
    if (explanation || oe || options || text || tableRows) return { explanation, optionExplanations: oe, correct, options, text, columnA, columnB, tableRows };
  }

  // Couldn't parse as JSON at all — salvage the explanation with regex (from the
  // backslash-repaired text so single-backslash LaTeX survives the salvage too).
  return salvageExplanation(repairJson(t));
}

// Build the Mongo $set for an extended question. Always updates the explanation
// (+ per-option notes). For NUMERICAL corrections, when the AI returned a valid
// corrected answer index it also updates `correct`; option VALUES are replaced
// only together with a corrected index (so options and answer stay in sync).
function buildExtendSet(q, parsed) {
  const set = { explanation: parsed.explanation };
  const newCorrect =
    Number.isInteger(parsed?.correct) && parsed.correct >= 0 && parsed.correct <= 3 ? parsed.correct : null;
  const newOptions =
    Array.isArray(parsed?.options) && parsed.options.length === 4 && parsed.options.every((s) => String(s).trim() !== "")
      ? parsed.options.map((x) => String(x))
      : null;
  // The correct answer is verifiable for EVERY question type, so a corrected
  // index may be applied to any type. Option VALUES may be rewritten for the
  // free-form + "how many are correct" families (plain MCQ, table, and
  // pair/pairselect/statement/matching) — e.g. to insert a missing "None of the
  // pairs" choice — but NOT for assertion–reason, whose four options are a fixed
  // rubric.
  const canFixOptions = !q.type || ["mcq", "table", "pair", "pairselect", "statement", "matching"].includes(q.type);
  if (newOptions && newCorrect != null && canFixOptions) set.options = newOptions; // replace values only with a corrected index
  if (newCorrect != null) set.correct = newCorrect;
  const effectiveCorrect = newCorrect != null ? newCorrect : q.correct;
  if (Array.isArray(parsed?.optionExplanations)) {
    const oe = parsed.optionExplanations.slice(0, 4);
    while (oe.length < 4) oe.push("");
    if (typeof effectiveCorrect === "number" && effectiveCorrect >= 0 && effectiveCorrect < 4) oe[effectiveCorrect] = "";
    set.optionExplanations = oe;
  }
  return set;
}

async function runExtendJob(id, { endpoints, model, questions, owner = null, notes = "" }) {
  const job = genJobs.get(id);
  const deadline = Date.now() + 12 * 60 * 1000; // overall time budget
  const save = (patch) => Object.assign(job, patch, { updatedAt: Date.now() });
  const total = questions.length;
  let updated = 0;
  let lastError = null;
  let keyDead = false;

  // Extend ONE question: call AI, parse (robustly), update in place. Returns
  // true only when the DB was actually updated with a real explanation.
  const extendOne = async (q, eps) => {
    const r = await callWithFallback({
      endpoints: eps && eps.length ? eps : endpoints,
      model,
      systemPrompt: EXTEND_SYSTEM_PROMPT,
      userPrompt: buildExtendPrompt(q, notes),
      maxTokens: 8000, // the verified/step-by-step replies are long — avoid truncation
      owner,
    });
    if (!r.ok) {
      lastError = r;
      if ([401, 403].includes(r.status)) keyDead = true;
      return false;
    }
    const parsed = parseExplanationJson(r.content);
    if (!parsed || !parsed.explanation) return false; // require a real explanation
    const set = buildExtendSet(q, parsed); // may also fix a wrong numerical answer/options
    await Question.updateOne({ _id: q._id }, { $set: set }).catch(() => {});
    updated += 1;
    job.questions.push(1); // progress = actual successes (jobStatus reports count)
    save({});
    return true;
  };

  // Multiple passes: any question that fails (bad/truncated JSON, transient
  // error, or a momentary quota blip) is retried on the next pass, so NO
  // question is left un-extended unless every attempt genuinely fails.
  const MAX_PASSES = 4;
  let pending = [...questions];
  try {
    for (let pass = 0; pass < MAX_PASSES && pending.length && !keyDead && Date.now() < deadline; pass++) {
      const failed = [];
      let idx = 0;
      // One worker PER KEY (up to 10) — each starts on a DIFFERENT key (rotated
      // endpoint order) so they don't all hammer the same key at once; a 429 on
      // one still falls back to the others. This uses every key in parallel and
      // is why bulk extend now gets through the whole quiz, not just a few.
      const rotate = (arr, k) => arr.slice(k).concat(arr.slice(0, k));
      const nEps = endpoints?.length || 1;
      const WORKERS = Math.min(Math.max(nEps, 1), 10);
      const worker = async (wi) => {
        const eps = nEps > 1 ? rotate(endpoints, wi % nEps) : endpoints;
        while (idx < pending.length && !keyDead && Date.now() < deadline) {
          const q = pending[idx++];
          let ok = false;
          try { ok = await extendOne(q, eps); } catch { ok = false; }
          if (!ok) failed.push(q);
        }
      };
      await Promise.all(Array.from({ length: WORKERS }, (_, wi) => worker(wi)));
      pending = failed;
      // Pause before retrying the stragglers. On a quota hit (429) wait long
      // enough for the per-minute limit to recover, so a single run gets through
      // more before giving up; otherwise just a brief transient-error pause.
      if (pending.length && pass < MAX_PASSES - 1 && !keyDead && Date.now() < deadline) {
        const wait = lastError?.status === 429 ? 40000 : 2000;
        if (Date.now() + wait < deadline) await new Promise((r) => setTimeout(r, wait));
      }
    }

    if (updated === 0) {
      save({
        status: "error",
        error: lastError
          ? (lastError.status === 429
            ? "AI quota/rate limit reached before any explanation was updated. Wait a minute and try again."
            : `AI provider error (${lastError.status || 0}). ${(lastError.detail || "").slice(0, 150)}`)
          : "No explanations could be updated. Try again.",
      });
    } else {
      // If some remain, tell the caller so they can simply run it again.
      const short = updated < total;
      save({
        status: "done",
        updatedCount: updated,
        requested: total,
        error: short ? (lastError?.status === 429 ? "quota" : "partial") : null,
        remaining: short ? total - updated : 0,
      });
    }
  } catch (err) {
    save(updated ? { status: "done", updatedCount: updated } : { status: "error", error: err?.message || "Failed to extend explanations." });
  }
}

// POST /api/ai/extend-explanations  (admin or owning client)
// Body: { quiz? | testSeries?, model?, notes?, mode? } — starts a background job
// that rewrites the explanation + option notes of EVERY question in that quiz or
// test, updating them in place. Poll /api/ai/job/:id for progress.
export async function extendExplanations(req, res) {
  const scope = resolveScope(req.user, req.body?.mode);
  if (scope.denied) {
    return res.status(403).json({ message: "AI access is not enabled for your account. Please contact the administrator." });
  }
  const chosen = await resolveModel(String(req.body?.model || "").trim(), scope);
  if (!chosen || !chosen.endpoints.length) {
    return res.status(400).json({
      message: scope.mode === "self"
        ? "No API keys added yet. Add at least one key in the AI tab."
        : "AI is not configured. Add an API key in Admin → AI Keys.",
    });
  }

  // Load the target quiz/test's questions, scoped to the caller's own space so a
  // client can only touch their own content and an admin only platform content.
  const own = ownerFilter(req);
  let filter = null;
  if (req.body?.testSeries) filter = { testSeries: req.body.testSeries, ...own };
  else if (req.body?.quiz) filter = { quiz: req.body.quiz, ...own };
  if (!filter) return res.status(400).json({ message: "Provide a quiz or test to update." });

  // Process LEAST-RECENTLY-UPDATED first. Extending a question bumps its
  // updatedAt, so when a run stops early on quota, clicking "Extend" again
  // starts with the questions that were NOT reached last time — so repeated runs
  // actually finish the whole quiz instead of re-doing the first few each time.
  const questions = await Question.find(filter).sort("updatedAt").select("_id type text options correct columnA columnB tableRows assertion reason explanation").lean();
  if (!questions.length) return res.status(400).json({ message: "No questions found to update (or not your content)." });

  const notes = String(req.body?.notes || "").trim();
  cleanupJobs();
  const id = newJobId();
  genJobs.set(id, { status: "pending", questions: [], requested: questions.length, error: null, model: chosen.model, updatedAt: Date.now() });
  runExtendJob(id, { endpoints: chosen.endpoints, model: chosen.model, questions, owner: scope.owner, notes });
  res.json({ jobId: id, requested: questions.length, model: chosen.model });
}

// POST /api/ai/extend-explanation  (admin or owning client) — extend ONE
// question's explanation right away (synchronous, with a few retries) and
// return the updated explanation. Body: { questionId, model?, notes?, mode? }.
export async function extendOneExplanation(req, res) {
  const scope = resolveScope(req.user, req.body?.mode);
  if (scope.denied) {
    return res.status(403).json({ message: "AI access is not enabled for your account. Please contact the administrator." });
  }
  const chosen = await resolveModel(String(req.body?.model || "").trim(), scope);
  if (!chosen || !chosen.endpoints.length) {
    return res.status(400).json({
      message: scope.mode === "self"
        ? "No API keys added yet. Add at least one key in the AI tab."
        : "AI is not configured. Add an API key in Admin → AI Keys.",
    });
  }

  const own = ownerFilter(req);
  const q = await Question.findOne({ _id: req.body?.questionId, ...own })
    .select("_id type text options correct columnA columnB assertion reason explanation optionExplanations")
    .lean();
  if (!q) return res.status(404).json({ message: "Question not found (or not your content)." });

  const notes = String(req.body?.notes || "").trim();
  let parsed = null;
  let lastError = null;
  // A few attempts so a bad/truncated JSON reply is retried, not lost.
  for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
    const r = await callWithFallback({
      endpoints: chosen.endpoints,
      model: chosen.model,
      systemPrompt: EXTEND_SYSTEM_PROMPT,
      userPrompt: buildExtendPrompt(q, notes),
      maxTokens: 8000,
      owner: scope.owner,
    });
    if (!r.ok) {
      lastError = r;
      if ([401, 403].includes(r.status)) break; // key dead — stop
      continue;
    }
    const p = parseExplanationJson(r.content);
    if (p && p.explanation) parsed = p;
  }

  if (!parsed) {
    const msg = lastError?.status === 429
      ? "AI quota/rate limit reached. Wait a minute and try again."
      : `The AI didn't return a usable explanation${lastError ? ` (error ${lastError.status || 0})` : ""}. Try again.`;
    return res.status(502).json({ message: msg });
  }

  const set = buildExtendSet(q, parsed); // may also fix a wrong numerical answer/options
  await Question.updateOne({ _id: q._id }, { $set: set });
  res.json({
    _id: q._id,
    explanation: set.explanation,
    optionExplanations: set.optionExplanations || q.optionExplanations,
    correct: set.correct ?? q.correct, // reflect any answer correction so the UI updates
    options: set.options || q.options,
  });
}


/* --------------------- Regenerate a question's options ---------------------
   Takes the WHOLE existing question, analyses the stem/structure, and rebuilds
   fresh, correct OPTIONS + answer + explanations that actually fit it — fixing
   questions whose options or answer don't match the stem. The stem, type and any
   columns/assertion/reason are kept unchanged (reuses parseExplanationJson +
   buildExtendSet to apply the result). */

const REGEN_SYSTEM_PROMPT = `You are an expert exam question editor. You are given ONE existing exam question (its stem, type, any columns/assertion/reason, and its CURRENT options — which may be wrong or may not fit the question). ANALYSE the question and produce the CORRECT set of answer options that truly fit it, the correct answer, and rich explanations.

Respond with ONE valid JSON object and NOTHING else — no markdown, no code fences:
{"text":"...","options":["","","",""],"correct":0,"explanation":"...","optionExplanations":["","","",""]}
RULES:
- Keep the question's MEANING, TYPE and what it asks UNCHANGED. Do NOT invent a different question or change the numbers/facts being asked.
- FIX MATH RENDERING: if any math anywhere (stem, columns, options, explanation) is written as PLAIN TEXT, wrap it properly in $...$ so it renders — e.g. "3/4" → "$\\frac{3}{4}$", "x^2" → "$x^2$", "N/2" → "$\\frac{N}{2}$", "sqrt(2)" → "$\\sqrt{2}$", "25%" → "$25\\%$", "Sum(P1*Q0)/Sum(P0*Q0)" → "$\\frac{\\sum P_1 Q_0}{\\sum P_0 Q_0}$". Return the SAME meaning with the math wrapped and obvious typos/rendering fixed.
- COLUMN QUESTIONS (matching / pair / pairselect / statement): "text" must be ONLY the short intro line (e.g. "Identify the correct mapping." or "Consider the following statements:"). NEVER put the Column A / Column B / statement items inside "text". Put the Column A items in "columnA" and the Column B items in "columnB" (the SAME number of items as given), each with any formula/math wrapped in $...$ so the columns themselves render. Do NOT prefix these items with numbers or roman numerals (no "1.", "I.") — the app numbers Column A (1,2,3,4) and Column B (I,II,III,IV) automatically. The 4 "options" stay as mapping sequences (e.g. "1-II, 2-IV, 3-I, 4-III") / combinations.
- TABLE questions: the data table MUST go in "tableRows" (a 2D array; the FIRST inner row is the header), NEVER as a markdown/pipe table inside "text". "text" is ONLY the question sentence (no "| ... |" rows). If the question currently shows a table in the stem AND/OR in tableRows — even with DIFFERENT numbers — CONSOLIDATE into ONE correct table in "tableRows" (choose the data that is consistent with the intended options, wrap any math in each cell in $...$), remove the table from "text", then SOLVE the question from THAT table with the correct formula and set "options"/"correct" to match your computed value. Return the table in "tableRows".
- Regenerate the 4 "options", the 0-based "correct" index, the "explanation" and the 4 "optionExplanations" so they are correct and fit the question.
- "options": EXACTLY 4, fitting the question TYPE, with ONE genuinely correct answer and three plausible-but-wrong distractors. Wrap any numeric option value or expression in $...$ so it renders as math (e.g. "$12.5$", "$\\frac{3}{4}$", "$2^{10}$", "$25\\%$"):
  • mcq / table: four answer choices.
  • matching: each option is a FULL mapping like "1-III, 2-I, 3-IV, 4-II"; exactly one is the correct complete mapping.
  • statement: combinations like "1 only", "1 and 2 only", "Neither 1 nor 2".
  • pair: how MANY pairs are correctly matched — "Only one pair", "Only two pairs", "Only three pairs", "All four pairs", or "None of the pairs are correctly matched" when zero match.
  • pairselect: WHICH pairs are correct — "1 and 2 only", "2 and 3 only", "All of the above", etc.
  • assertion: keep the four standard A/R options; just choose the correct one.
- NUMERICAL: solve with the correct FORMULA step by step; the correct option MUST equal your computed value; show the working in "explanation" (each step on its own line).
- MATCHING / PAIR / STATEMENT: evaluate EACH pair/statement individually and make the answer reflect the TRUE count/combination; if none of the standard options fit (e.g. zero pairs match), include the right one (e.g. "None of the pairs are correctly matched").
- "correct": 0-based index (0-3) of the truly correct option; leave THAT option's "optionExplanations" entry an empty string "".
- "explanation": thorough, self-contained, each point/step on its own line. Write math as inline LaTeX between $...$ (never \\( \\) or \\[ \\]); NEVER use "$" for money. No trailing commas.
Return ONLY the JSON object.`;

function buildRegenPrompt(q, notes) {
  const lines = [`Question type: ${q.type || "mcq"}`];
  if (q.text) lines.push(`Question: ${q.text}`);
  if (q.assertion) lines.push(`Assertion (A): ${q.assertion}`);
  if (q.reason) lines.push(`Reason (R): ${q.reason}`);
  if (Array.isArray(q.columnA) && q.columnA.length) lines.push(`Column A: ${q.columnA.map((x, i) => `${i + 1}. ${x}`).join("  |  ")}`);
  if (Array.isArray(q.columnB) && q.columnB.length) lines.push(`Column B: ${q.columnB.map((x, i) => `${toRomanLite(i + 1)}. ${x}`).join("  |  ")}`);
  if (Array.isArray(q.tableRows) && q.tableRows.length) lines.push(`Current table (first row = header):\n${q.tableRows.map((r) => (Array.isArray(r) ? r.join(" | ") : String(r))).join("\n")}`);
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length) lines.push(`Current options (may be WRONG — replace with correct ones that fit the question):\n${opts.map((o, i) => `${EXT_LETTERS[i] || i}) ${o}`).join("\n")}`);
  if (notes) lines.push(`MANDATORY user instructions (follow EXACTLY): ${notes}`);
  lines.push(`Analyse THIS question and FIX anything wrong: rebuild the 4 "options", the "correct" index, the "explanation" and the 4 "optionExplanations" so they are correct and fit the question, AND wrap any plain-text math so it renders. Return the SAME stem in "text" (and same-count "columnA"/"columnB" for matching/pair/statement) with math wrapped in $...$ — keep the meaning unchanged. Return ONLY one valid JSON object {"text":"...","options":["","","",""],"correct":0,"explanation":"...","optionExplanations":["","","",""]}.`);
  return lines.join("\n");
}

// POST /api/ai/regenerate-question  (admin or owning client) — analyse ONE
// question and rebuild its options/answer/explanations to fit the stem.
// Body: { questionId, model?, notes?, mode? }.
export async function regenerateQuestion(req, res) {
  const scope = resolveScope(req.user, req.body?.mode);
  if (scope.denied) {
    return res.status(403).json({ message: "AI access is not enabled for your account. Please contact the administrator." });
  }
  const chosen = await resolveModel(String(req.body?.model || "").trim(), scope);
  if (!chosen || !chosen.endpoints.length) {
    return res.status(400).json({
      message: scope.mode === "self"
        ? "No API keys added yet. Add at least one key in the AI tab."
        : "AI is not configured. Add an API key in Admin → AI Keys.",
    });
  }

  const own = ownerFilter(req);
  const q = await Question.findOne({ _id: req.body?.questionId, ...own })
    .select("_id type text options correct columnA columnB tableRows assertion reason explanation optionExplanations")
    .lean();
  if (!q) return res.status(404).json({ message: "Question not found (or not your content)." });

  const notes = String(req.body?.notes || "").trim();
  let parsed = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
    const r = await callWithFallback({
      endpoints: chosen.endpoints,
      model: chosen.model,
      systemPrompt: REGEN_SYSTEM_PROMPT,
      userPrompt: buildRegenPrompt(q, notes),
      maxTokens: 8000, // full rebuild (stem + 4 options + explanation + 4 notes) — avoid truncation
      owner: scope.owner,
    });
    if (!r.ok) {
      lastError = r;
      if ([401, 403].includes(r.status)) break;
      continue;
    }
    const p = parseExplanationJson(r.content);
    // Accept a real rebuild: fresh options, an explanation, a re-wrapped stem, or a table.
    if (p && (p.explanation || (Array.isArray(p.options) && p.options.length === 4) || p.text || p.tableRows)) parsed = p;
  }

  if (!parsed) {
    const msg = lastError?.status === 429
      ? "AI quota/rate limit reached. Wait a minute and try again."
      : `The AI didn't return a usable question${lastError ? ` (error ${lastError.status || 0})` : ""}. Try again.`;
    return res.status(502).json({ message: msg });
  }

  // Apply everything the AI rebuilt: the re-wrapped stem/columns (same meaning,
  // math wrapped so it RENDERS), fresh options + answer, and explanations.
  const set = {};
  if (parsed.explanation) set.explanation = parsed.explanation;
  // Column-based questions keep their items in columnA/columnB — never in the
  // stem. So for these, strip any "Column A/B …" block the model wrongly merged
  // into "text" (this also CLEANS a question already broken that way), and only
  // replace the column arrays (same item count) with their LaTeX-wrapped form.
  const isColumnType = ["matching", "pair", "pairselect", "statement"].includes(q.type);
  const isTableType = q.type === "table";
  if (isColumnType) {
    // Take the intro only (before any "Column A/B …"); fall back to cleaning the
    // stored stem so a question already bloated with columns gets repaired.
    const introOnly = (s) => String(s || "").split(/\bColumn\s*[AB]\b\s*:?/i)[0].trim();
    const intro = introOnly(parsed.text) || introOnly(q.text);
    if (intro) set.text = intro;
  } else if (isTableType) {
    // The data table belongs in tableRows — strip any markdown/pipe table (a line
    // with 2+ "|") that ended up in the stem, keeping only the question sentence.
    // Falls back to cleaning the stored stem so an already-broken question is fixed.
    const stripTable = (s) => String(s || "").split(/\r?\n/).filter((ln) => (ln.match(/\|/g) || []).length < 2).join("\n").replace(/\n{2,}/g, "\n").trim();
    const intro = stripTable(parsed.text) || stripTable(q.text);
    if (intro) set.text = intro;
    if (Array.isArray(parsed.tableRows) && parsed.tableRows.length && parsed.tableRows.every((r) => Array.isArray(r))) {
      set.tableRows = parsed.tableRows.map((r) => r.map((c) => (c == null ? "" : String(c))));
    }
  } else if (parsed.text) {
    set.text = parsed.text;
  }
  // Strip any leading "1."/"I." marker — the app auto-numbers Column A (1,2,3,4)
  // and Column B (I,II,III,IV), so keeping a prefix here double-numbers them.
  if (Array.isArray(parsed.columnA) && Array.isArray(q.columnA) && parsed.columnA.length === q.columnA.length) set.columnA = parsed.columnA.map(stripListMarker);
  if (Array.isArray(parsed.columnB) && Array.isArray(q.columnB) && parsed.columnB.length === q.columnB.length) set.columnB = parsed.columnB.map(stripListMarker);
  const newCorrect = Number.isInteger(parsed.correct) && parsed.correct >= 0 && parsed.correct <= 3 ? parsed.correct : null;
  const newOptions = Array.isArray(parsed.options) && parsed.options.length === 4 && parsed.options.every((s) => String(s).trim() !== "")
    ? parsed.options.map((x) => String(x)) : null;
  const canFixOptions = !q.type || ["mcq", "table", "pair", "pairselect", "statement", "matching"].includes(q.type);
  if (newOptions && newCorrect != null && canFixOptions) set.options = newOptions;
  if (newCorrect != null) set.correct = newCorrect;
  const eff = newCorrect != null ? newCorrect : q.correct;
  if (Array.isArray(parsed.optionExplanations)) {
    const oe = parsed.optionExplanations.slice(0, 4);
    while (oe.length < 4) oe.push("");
    if (typeof eff === "number" && eff >= 0 && eff < 4) oe[eff] = "";
    set.optionExplanations = oe;
  }
  if (!Object.keys(set).length) return res.status(502).json({ message: "The AI did not return any usable changes. Try again." });

  await Question.updateOne({ _id: q._id }, { $set: set });
  res.json({
    _id: q._id,
    text: set.text ?? q.text,
    options: set.options || q.options,
    correct: set.correct ?? q.correct,
    explanation: set.explanation ?? q.explanation,
    optionExplanations: set.optionExplanations || q.optionExplanations,
    tableRows: set.tableRows || q.tableRows,
  });
}


/* --------------------------- AI key management (admin) --------------------------- */

const maskKey = (k) => {
  const s = String(k || "");
  return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`;
};

// Never send the raw key to the browser — only a masked hint + metadata.
function keyToClient(k) {
  return {
    _id: k._id,
    label: k.label || "",
    baseUrl: k.baseUrl,
    models: k.models,
    enabled: k.enabled,
    order: k.order,
    keyMask: maskKey(k.key),
    lastStatus: k.lastStatus || "",
    lastError: k.lastError || "",
    lastCheckedAt: k.lastCheckedAt || null,
    usedRequests: k.usedRequests || 0,
    usedTokens: k.usedTokens || 0,
    creditLimit: k.creditLimit || 0,
  };
}

// The key pool a request manages: admin → platform keys (owner null); a client
// → only their OWN keys. All key-management queries are scoped by this so a
// client can never see or touch platform keys (or another client's keys).
function keyOwner(req) {
  return req.user?.role === "client" ? req.user._id : null;
}

// GET /api/ai/keys — DB keys (editable). For the admin these are the platform
// keys plus the read-only env-var keys; for a client, only their own keys.
export async function listKeys(req, res) {
  const owner = keyOwner(req);
  const isAdmin = req.user?.role === "admin";
  const db = await AiKey.find({ owner: owner ?? null }).sort("order createdAt").lean();
  const dbList = db.map((k) => ({ ...keyToClient(k), source: "db" }));

  // Env-var keys are part of the PLATFORM pool only — never shown to clients.
  const dbKeyValues = new Set(db.map((k) => (k.key || "").trim()));
  const envList = (isAdmin ? envProviders() : [])
    .map((p, i) => ({
      _id: `env-${i + 1}`,
      source: "env",
      readOnly: true, // configured in Render — import it to manage from the UI
      label: i === 0 ? "Server key · AI_API_KEY" : `Server key · AI_API_KEY_${i + 1}`,
      baseUrl: p.baseUrl,
      models: p.models.join(", "),
      key: p.key, // used only to import; stripped before sending below
      keyMask: maskKey(p.key),
      enabled: true,
      lastStatus: "",
      lastError: "",
      lastCheckedAt: null,
      usedRequests: 0,
      usedTokens: 0,
      creditLimit: 0,
    }))
    .filter((p) => !dbKeyValues.has(p.key))
    .map(({ key, ...rest }) => rest); // never send the raw key to the browser

  const models = (await modelRegistry({ owner: owner ?? null, includeEnv: isAdmin })).map((r) => r.model);

  // Aggregate usage across the DB keys (app-tracked — providers don't expose
  // real remaining credits). creditLimit is a manual token budget the admin
  // enters, so remaining = sum(creditLimit) − sum(usedTokens) for limited keys.
  const totalRequests = db.reduce((s, k) => s + (k.usedRequests || 0), 0);
  const totalTokens = db.reduce((s, k) => s + (k.usedTokens || 0), 0);
  const limited = db.filter((k) => (k.creditLimit || 0) > 0);
  const totalCredits = limited.reduce((s, k) => s + (k.creditLimit || 0), 0);
  const usedOnLimited = limited.reduce((s, k) => s + (k.usedTokens || 0), 0);
  const totalRemaining = Math.max(0, totalCredits - usedOnLimited);

  res.json({
    keys: [...dbList, ...envList],
    models,
    totals: {
      totalRequests,
      totalTokens,
      totalCredits, // sum of manual credit limits (0 if none set)
      totalRemaining, // credits − used, only counting keys that have a limit
      hasLimits: limited.length > 0,
    },
  });
}

// POST /api/ai/keys (admin)
export async function createKey(req, res) {
  const { label, baseUrl, models, key, creditLimit } = req.body || {};
  if (!key || !String(key).trim()) return res.status(400).json({ message: "API key is required." });
  const owner = keyOwner(req);
  const order = await AiKey.countDocuments({ owner: owner ?? null });
  const doc = await AiKey.create({
    owner,
    label: String(label || "").trim(),
    baseUrl: String(baseUrl || "").trim() || "https://generativelanguage.googleapis.com/v1beta/openai",
    models: String(models || "").trim() || "gemini-2.5-flash",
    key: String(key).trim(),
    creditLimit: Math.max(0, parseInt(creditLimit, 10) || 0),
    enabled: true,
    order,
  });
  res.status(201).json(keyToClient(doc));
}

// POST /api/ai/keys/bulk (admin) — add MANY keys in one go, all sharing the same
// provider preset (baseUrl / models / creditLimit). Accepts `keys` as an array
// OR a single string with keys separated by newlines, commas or spaces. Blank
// entries, duplicates within the paste, and keys already stored are skipped.
export async function bulkCreateKeys(req, res) {
  const { keys, baseUrl, models, creditLimit, label } = req.body || {};
  const raw = Array.isArray(keys) ? keys : String(keys || "").split(/[\s,]+/);

  // Clean + de-duplicate the pasted keys (API keys never contain spaces/commas).
  const cleaned = [];
  const seenInput = new Set();
  for (const k of raw) {
    const v = String(k || "").trim();
    if (!v || seenInput.has(v)) continue;
    seenInput.add(v);
    cleaned.push(v);
  }
  if (!cleaned.length) return res.status(400).json({ message: "Paste at least one API key." });

  const owner = keyOwner(req);
  // De-dupe within THIS pool only (a client's key list, or the platform's).
  const existing = new Set((await AiKey.find({ owner: owner ?? null }).select("key").lean()).map((k) => (k.key || "").trim()));
  const baseUrlClean =
    String(baseUrl || "").trim() || "https://generativelanguage.googleapis.com/v1beta/openai";
  const modelsClean = String(models || "").trim() || "gemini-2.5-flash";
  const limitClean = Math.max(0, parseInt(creditLimit, 10) || 0);
  const labelBase = String(label || "").trim();

  let order = await AiKey.countDocuments({ owner: owner ?? null });
  const created = [];
  let skipped = 0;
  for (const key of cleaned) {
    if (existing.has(key)) { skipped += 1; continue; }
    const doc = await AiKey.create({
      owner,
      label: labelBase ? `${labelBase} ${created.length + 1}` : "",
      baseUrl: baseUrlClean,
      models: modelsClean,
      key,
      creditLimit: limitClean,
      enabled: true,
      order: order++,
    });
    existing.add(key);
    created.push(keyToClient(doc));
  }
  res.status(201).json({ created: created.length, skipped, keys: created });
}

// PUT /api/ai/keys/:id (admin) — key is only replaced when a new one is provided.
export async function updateKey(req, res) {
  const { label, baseUrl, models, enabled, key, order, creditLimit, resetUsage } = req.body || {};
  const patch = {};
  if (label !== undefined) patch.label = String(label).trim();
  if (baseUrl !== undefined) patch.baseUrl = String(baseUrl).trim();
  if (models !== undefined) patch.models = String(models).trim();
  if (enabled !== undefined) patch.enabled = !!enabled;
  if (order !== undefined) patch.order = parseInt(order, 10) || 0;
  if (key !== undefined && String(key).trim()) patch.key = String(key).trim();
  if (creditLimit !== undefined) patch.creditLimit = Math.max(0, parseInt(creditLimit, 10) || 0);
  // Let the admin zero the app-tracked usage counters (e.g. after a quota reset).
  if (resetUsage) { patch.usedRequests = 0; patch.usedTokens = 0; }
  // Scope by owner so a client can only edit their OWN keys (and admin only
  // platform keys) — never each other's.
  const doc = await AiKey.findOneAndUpdate({ _id: req.params.id, owner: keyOwner(req) ?? null }, patch, { new: true });
  if (!doc) return res.status(404).json({ message: "Key not found" });
  res.json(keyToClient(doc));
}

// DELETE /api/ai/keys/:id — scoped to the caller's own pool.
export async function deleteKey(req, res) {
  const doc = await AiKey.findOneAndDelete({ _id: req.params.id, owner: keyOwner(req) ?? null });
  if (!doc) return res.status(404).json({ message: "Key not found" });
  res.json({ message: "Key deleted" });
}

// Fetch the model ids a key can use (OpenAI-compatible /models). Returns [].
async function fetchModels(key, baseUrl) {
  try {
    const resp = await fetch(`${(baseUrl || DEFAULT_BASE).replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!resp.ok) return [];
    const data = await resp.json().catch(() => ({}));
    return (Array.isArray(data?.data) ? data.data : [])
      .map((m) => String(m?.id || "").replace(/^models\//, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Choose a sensible default model from a list. Prefers FREE options first (so we
// never auto-select a paid model), then light "flash"/"mini" chat models.
function pickPreferredModel(models) {
  if (!models.length) return "";
  const pref = [/:free$/i, /gemini[.\-\d]*flash/i, /flash/i, /gpt-4o-mini/i, /mini/i, /haiku/i, /chat/i];
  for (const rx of pref) {
    const hit = models.find((m) => rx.test(m) && !/embed|vision|image|whisper|tts|audio/i.test(m));
    if (hit) return hit;
  }
  return models.find((m) => !/embed|image|whisper|tts|audio/i.test(m)) || models[0];
}

// Live-test one key doc: updates lastStatus and returns whether it worked.
// AUTO-REPAIR: if the configured model is invalid (404), find a valid model for
// this key and switch to it automatically, so a valid key never stays "broken".
async function runKeyTest(doc) {
  let model = (doc.models || "").split(",").map((m) => m.trim()).filter(Boolean)[0] || "gpt-4o-mini";
  const baseUrl = (doc.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  let r = await callProvider({ key: doc.key, baseUrl, model, userPrompt: "Reply with the word ok.", maxTokens: 5 });

  if (!r.ok && r.status === 404) {
    const picked = pickPreferredModel(await fetchModels(doc.key, baseUrl));
    if (picked && picked !== model) {
      doc.models = picked; // remember the working model on this key
      model = picked;
      r = await callProvider({ key: doc.key, baseUrl, model, userPrompt: "Reply with the word ok.", maxTokens: 5 });
    }
  }

  doc.lastStatus = r.ok ? "ok" : "error";
  doc.lastError = r.ok ? "" : `HTTP ${r.status || 0}: ${(r.detail || "").slice(0, 150)}`;
  doc.lastCheckedAt = new Date();
  await doc.save();
  return r.ok;
}

// POST /api/ai/keys/import (admin) — copy Render env-var keys into the DB so they
// become fully manageable (test/edit/delete). Skips keys already imported.
export async function importEnvKeys(req, res) {
  // Env keys belong to the PLATFORM pool (owner null) and this route is
  // admin-only, so scope the de-dupe/order to platform keys.
  const existing = new Set((await AiKey.find({ owner: null }).select("key").lean()).map((k) => (k.key || "").trim()));
  let order = await AiKey.countDocuments({ owner: null });
  let imported = 0;
  for (const p of envProviders()) {
    if (existing.has(p.key)) continue;
    await AiKey.create({
      owner: null,
      label: "Imported from server",
      baseUrl: p.baseUrl,
      models: p.models.join(", "),
      key: p.key,
      enabled: true,
      order: order++,
    });
    imported += 1;
  }
  res.json({ imported });
}

// POST /api/ai/keys/test-all — test every DB key in the caller's pool.
export async function testAllKeys(req, res) {
  const keys = await AiKey.find({ owner: keyOwner(req) ?? null });
  for (const doc of keys) await runKeyTest(doc);
  res.json({ tested: keys.length });
}

// POST /api/ai/keys/:id/models (admin) — ask the provider which models THIS key
// can actually use (OpenAI-compatible /models list). Fixes "404 model not found"
// guesswork by showing valid ids to choose from.
export async function listKeyModels(req, res) {
  const doc = await AiKey.findOne({ _id: req.params.id, owner: keyOwner(req) ?? null });
  if (!doc) return res.status(404).json({ message: "Key not found" });
  const baseUrl = (doc.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  try {
    const resp = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${doc.key}` } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ message: data?.error?.message || `HTTP ${resp.status}` });
    const models = (Array.isArray(data?.data) ? data.data : [])
      .map((m) => String(m?.id || "").replace(/^models\//, "")) // strip Google's "models/" prefix
      .filter(Boolean)
      .sort();
    res.json({ models });
  } catch (e) {
    res.status(502).json({ message: e.message || "Could not list models for this key." });
  }
}

// POST /api/ai/keys/:id/test (admin) — makes a tiny live call to check the key.
export async function testKey(req, res) {
  const doc = await AiKey.findOne({ _id: req.params.id, owner: keyOwner(req) ?? null });
  if (!doc) return res.status(404).json({ message: "Key not found" });
  const ok = await runKeyTest(doc);
  res.json({ ok, status: doc.lastStatus, error: doc.lastError, lastCheckedAt: doc.lastCheckedAt });
}


/* --------------------------- Client AI access & mode --------------------------- */

// GET /api/ai/access — the current user's AI configuration, used to drive the
// client "AI" tab: whether they have access, which pools they may use, their
// chosen mode, how many of their own keys exist, and whether built-in AI is
// actually available. Admins always have full built-in access.
export async function getAiAccess(req, res) {
  const user = req.user;
  if (!user || user.role !== "client") {
    const inbuiltKeys = (await providers(SYSTEM_SCOPE)).length;
    return res.json({ role: user?.role || "guest", access: true, mode: "inbuilt", allowInbuilt: true, allowSelf: false, ownKeys: 0, inbuiltAvailable: inbuiltKeys > 0, inbuiltKeys });
  }
  const scope = resolveScope(user);
  const allowInbuilt = user.aiAllowInbuilt !== false;
  const allowSelf = user.aiAllowSelf !== false;
  const [ownKeys, inbuiltKeys] = await Promise.all([
    AiKey.countDocuments({ owner: user._id }),
    allowInbuilt ? providers(SYSTEM_SCOPE).then((p) => p.length) : Promise.resolve(0),
  ]);
  res.json({
    role: "client",
    access: user.aiAccess === true && !scope.denied,
    mode: scope.denied ? null : scope.mode,
    allowInbuilt,
    allowSelf,
    ownKeys,
    inbuiltAvailable: allowInbuilt && inbuiltKeys > 0,
    inbuiltKeys,
  });
}

// PUT /api/ai/mode — a client picks which pool to use ("inbuilt" | "self"),
// within what the admin allows. No-op for non-clients.
export async function setAiMode(req, res) {
  const user = req.user;
  if (!user || user.role !== "client") return res.status(403).json({ message: "Only client accounts can set an AI mode." });
  if (!user.aiAccess) return res.status(403).json({ message: "AI access is not enabled for your account." });
  const mode = req.body?.mode === "self" ? "self" : "inbuilt";
  if (mode === "self" && user.aiAllowSelf === false) return res.status(400).json({ message: "Your own API keys are not permitted for this account." });
  if (mode === "inbuilt" && user.aiAllowInbuilt === false) return res.status(400).json({ message: "Built-in AI is not permitted for this account." });
  user.aiMode = mode;
  await user.save();
  res.json({ mode: user.aiMode });
}
