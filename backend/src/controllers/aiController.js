// AI Question Generator — talks to any OpenAI-compatible provider
import AiKey from "../models/AiKey.js";

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
async function callWithFallback({ endpoints, model, userPrompt, maxTokens, owner = null }) {
  let last = { ok: false, status: 0, detail: "No AI key is configured." };
  for (const ep of endpoints || []) {
    const r = await callProvider({ key: ep.key, baseUrl: ep.baseUrl, model, userPrompt, maxTokens });
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
- "table": include "tableRows" (a 2D array; the first inner array is the header row). "text" is the intro. 4 normal options.
Do NOT prefix columnA / columnB / statement items with numbers or roman numerals (no "1.", "I.") — the app numbers Column A (1,2,3,4), Column B (I,II,III,IV) and statements (1,2,3) automatically.
Never include image URLs. Keep questions factually correct and self-contained.`;

function buildUserPrompt({ topic, count, difficulty, types, notes, plan, avoid }) {
  const lines = [`Topic / syllabus: ${topic}.`];

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

  if (notes) lines.push(`Extra instructions: ${notes}`);
  lines.push(
    `For every question write a rich, complete "explanation" that includes all relevant facts (dates, years, historical context, definitions, formulas with calculations, named laws/principles) — not a single line. Whenever a term/place/concept/option has a local or alternative name (common name, vernacular/Hindi/regional name, synonym, abbreviation's full form, or old name), add it in brackets. Write the explanation across several short lines — each point on its own line, not one paragraph. Vary which option (A/B/C/D) is correct across the set.`
  );
  if (Array.isArray(avoid) && avoid.length) {
    const list = avoid.slice(0, 40).map((s, i) => `${i + 1}) ${String(s).slice(0, 120)}`).join("\n");
    lines.push(
      `IMPORTANT — these questions ALREADY EXIST. Do NOT repeat, restate or paraphrase any of them; generate ENTIRELY DIFFERENT questions covering other facts/aspects of the topic:\n${list}`
    );
  }
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
    // Fall back to slicing the outermost object/array.
    const oStart = t.indexOf("{");
    const oEnd = t.lastIndexOf("}");
    const aStart = t.indexOf("[");
    const aEnd = t.lastIndexOf("]");
    const tryParse = (s, e) => {
      if (s === -1 || e === -1 || e <= s) return null;
      try {
        return JSON.parse(t.slice(s, e + 1));
      } catch {
        return null;
      }
    };
    obj = tryParse(oStart, oEnd) || tryParse(aStart, aEnd);
  }
  if (!obj) return salvageObjects(t); // last resort: recover from truncated JSON
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
async function callProvider({ key, baseUrl, model, userPrompt, maxTokens }) {
  const payload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: maxTokens,
  };
  // Gemini burns budget on hidden "thinking" which truncates JSON — turn it off
  // (sent only for Gemini; OpenAI/Claude reject this field).
  if (/gemini/i.test(model)) payload.reasoning_effort = "none";

  // 429 is NOT retried here — it returns immediately so the caller can switch to
  // the next configured key. Only "busy" server errors are retried on this key.
  const TRANSIENT = [500, 502, 503, 504];
  const WAITS = [1500, 3000, 6000, 9000];
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(`${(baseUrl || "https://api.tokenlab.sh/v1").replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
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
   NOTE: jobs are kept in memory — fine for a single backend instance. */
const genJobs = new Map(); // id -> { status, questions, requested, error, model, updatedAt }

function newJobId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function cleanupJobs() {
  const cutoff = Date.now() - 20 * 60 * 1000; // 20 min
  for (const [id, j] of genJobs) if (j.updatedAt < cutoff) genJobs.delete(id);
}

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
  const { workers, model, topic, notes, plan, count, difficulty, types, target, avoid, owner = null } = ctx;
  const job = genJobs.get(id);
  const deadline = Date.now() + 8 * 60 * 1000; // overall time budget

  // Signature of a question (normalised stem) used to guarantee NO duplicates —
  // neither within this batch nor against questions from an earlier batch
  // (the caller passes their stems in `avoid`). This is the reliable no-repeat
  // guarantee; the prompt instruction just reduces wasted regeneration.
  const qSig = (q) => String(q?.text || q || "").toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set((avoid || []).map(qSig).filter(Boolean));
  const avoidForPrompt = (avoid || []).slice(0, 40);
  const MAX_QUOTA_WAITS = 6; // per key: how many per-minute 429s we ride out before retiring it
  const MAX_ATTEMPTS = Math.ceil(target / CHUNK_SIZE) + 12 + (workers?.length || 1) * MAX_QUOTA_WAITS; // global safety cap
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
      const chunk = takeChunk(rem, CHUNK_SIZE);
      for (const b of chunk) reserved[`${b.type}|${b.difficulty}`] = (reserved[`${b.type}|${b.difficulty}`] || 0) + b.count;
      return { chunk, n: chunk.reduce((s, b) => s + b.count, 0) };
    }
    const remaining = target - collected.length - reservedCount;
    if (remaining <= 0) return null;
    const n = Math.min(CHUNK_SIZE, remaining);
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
        ? buildUserPrompt({ topic, notes, plan: res.chunk, avoid: avoidForPrompt })
        : buildUserPrompt({ topic, notes, count: res.n, difficulty, types, avoid: avoidForPrompt });
      const maxTokens = Math.min(16000, 1800 + res.n * 1000);
      attempts += 1;
      const r = await callProvider({ key: ep.key, baseUrl: ep.baseUrl, model: ep.model || model, userPrompt: prompt, maxTokens });
      release(res); // free the reservation — any shortfall gets re-targeted next round
      if (r.ok) {
        AiKey.updateOne({ key: ep.key, owner: owner ?? null }, { $inc: { usedRequests: 1, usedTokens: r.tokens || 0 } }).catch(() => {});
        for (const q of normalize(parseQuestions(r.content))) {
          if (collected.length >= target) break;
          const sig = qSig(q);
          if (!sig || seen.has(sig)) continue; // skip blanks + any duplicate (this batch or earlier)
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

  const topic = String(req.body?.topic || "").trim();
  if (!topic) return res.status(400).json({ message: "A topic is required." });

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
  runGenerationJob(id, { workers, model, topic, notes, plan, count, difficulty, types, target, avoid, owner: scope.owner });

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

// Signature to de-duplicate questions collected across chunks/sections.
function extractSig(q) {
  const opts = (Array.isArray(q.options) ? q.options : []).map((o) => String(o).toLowerCase().trim()).join("|");
  return `${String(q.text).toLowerCase().replace(/\s+/g, " ").trim()}##${opts}`;
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

function buildExtractPrompt(sourceText) {
  return [
    'You extract questions from an exam/quiz document. Return ONLY JSON: {"questions":[...]}.',
    "",
    "MOST IMPORTANT: capture EVERY question in the material below — do not skip, summarise, merge or invent any. If the text contains 40 questions, return all 40, in their original order. Missing questions is the worst possible outcome.",
    "",
    "Reproduce each question exactly as written (same wording, same options). For each one set:",
    '- "text": the full question stem, verbatim.',
    '- "type": choose the type that matches how the question actually looks:',
    '    • "assertion" — an Assertion (A) and Reason (R) pair → put them in "assertion" and "reason".',
    '    • "statement" — a "consider the following statements" question → put each statement verbatim in "columnA" (array).',
    '    • "matching" — match List/Column I with List/Column II → left items in "columnA", right items in "columnB".',
    '    • "table" — data laid out as a table → each row as an array inside "tableRows".',
    '    • "mcq" — everything else: ordinary multiple choice, true/false, fill-in-the-blank, numerical/integer-answer, etc.',
    '- "options": the answer choices exactly as printed (4 for MCQ). For true/false use ["True","False","",""]. If more than 4 are printed, keep the 4 real ones. If the source genuinely has no printed options, give the most sensible 4.',
    '- "correct": 0-based index of the right option when the source shows it (answer key, bold, "Ans", tick); otherwise your best answer.',
    '- "explanation": at most ONE short sentence, and only when obvious.',
    "",
    "Keep everything BRIEF — do NOT write per-option notes or long explanations. Verbose output makes questions get cut off and lost, which must not happen.",
    "",
    "SOURCE MATERIAL:",
    sourceText,
  ].join("\n");
}

// Background worker: extract questions from every source chunk and combine
// (de-duplicated), so a multi-section page is imported in one go.
async function runExtractionJob(id, { endpoints, model, chunks, owner = null }) {
  const job = genJobs.get(id);
  const deadline = Date.now() + 8 * 60 * 1000; // 8-minute budget (smaller chunks = more calls)
  const collected = [];
  const seen = new Set();
  let lastError = null;

  const save = (patch) => Object.assign(job, patch, { updatedAt: Date.now() });

  try {
    for (let c = 0; c < chunks.length; c++) {
      if (Date.now() > deadline) break;
      const r = await callWithFallback({
        endpoints,
        model,
        userPrompt: buildExtractPrompt(chunks[c]),
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
        const sig = extractSig(q);
        if (seen.has(sig)) continue; // skip duplicates across chunks
        seen.add(sig);
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

  runExtractionJob(id, { endpoints, model, chunks, owner: scope.owner });
  res.json({ jobId: id, chunks: chunks.length, questionsDetected: detected?.count || 0, model });
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
