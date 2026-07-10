// AI Question Generator — talks to any OpenAI-compatible provider
// (TokenLab, OpenAI, Groq, DeepSeek, …). Configure via server env vars:
//   AI_API_KEY   — your provider key (required to enable the feature)
//   AI_BASE_URL  — base URL, default https://api.tokenlab.sh/v1
//   AI_MODEL     — one OR MANY model ids, comma-separated.
//                  e.g. "gpt-4o-mini, llama-3.3-70b, deepseek-chat"
//                  The first one is the default; the admin can pick any of
//                  them per-generation from a dropdown in the UI.
// The key lives ONLY on the server; the browser never sees it.

const BASE_URL = () => (process.env.AI_BASE_URL || "https://api.tokenlab.sh/v1").replace(/\/$/, "");

// Parse AI_MODEL into a clean list of model ids. Falls back to gpt-4o-mini.
function MODELS() {
  const raw = process.env.AI_MODEL || "gpt-4o-mini";
  const list = raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length ? list : ["gpt-4o-mini"];
}
const DEFAULT_MODEL = () => MODELS()[0];

// If the client asked for a specific model, only honour it when it is one of
// the configured models (prevents arbitrary model injection from the browser).
function resolveModel(requested) {
  const models = MODELS();
  return models.includes(requested) ? requested : models[0];
}

const TYPES = ["mcq", "matching", "statement", "pair", "pairselect", "assertion", "table"];
const DIFFS = ["Easy", "Medium", "Hard"];

// GET /api/ai/status — lets the admin UI show/hide the "Generate with AI"
// button and populate the model dropdown.
export function aiStatus(req, res) {
  res.json({
    enabled: !!process.env.AI_API_KEY,
    model: DEFAULT_MODEL(), // default / first configured model
    models: MODELS(), // full list for the dropdown
    baseUrl: BASE_URL(),
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
- "explanation": a detailed explanation of why the correct option is right.
- "optionExplanations": array of EXACTLY 4 short strings, one per option, explaining why each is right/wrong. Leave the correct option's entry an empty string "".
Type-specific extra fields:
- "matching"/"pair"/"pairselect": also include "columnA" (array) and "columnB" (array) to match. Each option in "options" is a mapping like "1-III, 2-I, 3-IV, 4-II".
- "assertion": include "assertion" (Assertion A text) and "reason" (Reason R text). The 4 options should be the standard A&R choices.
- "table": include "tableRows" (2D array; first inner array is the header row).
Never include image URLs. Keep questions factually correct and self-contained.`;

function buildUserPrompt({ topic, count, difficulty, types, notes, plan }) {
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
        out.columnA = arrStr(q?.columnA);
        out.columnB = arrStr(q?.columnB);
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

const MAX_TOTAL = 100; // most questions per generate request
const CHUNK_SIZE = 15; // questions generated per provider call (keeps each reply small enough to not truncate)

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
async function callProvider({ key, model, userPrompt, maxTokens }) {
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

  const TRANSIENT = [429, 500, 502, 503, 504];
  const WAITS = [1500, 3000, 6000, 9000];
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(`${BASE_URL()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const data = await resp.json();
      return { ok: true, content: extractContent(data) };
    }
    const detail = await resp.text().catch(() => "");
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

async function runGenerationJob(id, ctx) {
  const { key, model, topic, notes, plan, count, difficulty, types, target } = ctx;
  const job = genJobs.get(id);
  const deadline = Date.now() + 4 * 60 * 1000; // 4-minute overall budget
  const MAX_CALLS = Math.ceil(target / CHUNK_SIZE) + 5; // headroom for retries/top-ups
  const collected = [];
  let calls = 0;
  let lastError = null;

  const save = (patch) => {
    Object.assign(job, patch, { updatedAt: Date.now() });
  };

  try {
    while (collected.length < target && calls < MAX_CALLS && Date.now() < deadline) {
      let prompt;
      let n;
      if (plan) {
        const rem = remainingPlan(plan, collected);
        if (!rem.length) break; // distribution satisfied
        const chunk = takeChunk(rem, CHUNK_SIZE);
        n = chunk.reduce((s, b) => s + b.count, 0);
        prompt = buildUserPrompt({ topic, notes, plan: chunk });
      } else {
        n = Math.min(CHUNK_SIZE, target - collected.length);
        prompt = buildUserPrompt({ topic, notes, count: n, difficulty, types });
      }
      calls += 1;
      const maxTokens = Math.min(16000, 1500 + n * 700);
      const r = await callProvider({ key, model, userPrompt: prompt, maxTokens });
      if (!r.ok) {
        lastError = r;
        // A 429 means quota/rate exhausted — retrying more won't help right now.
        // Stop and return whatever we already have.
        if (r.status === 429) break;
        continue;
      }
      const qs = normalize(parseQuestions(r.content));
      for (const q of qs) {
        if (collected.length >= target) break;
        collected.push(q);
      }
      save({ questions: collected.slice() });
    }

    if (!collected.length) {
      let msg;
      if (lastError?.status === 429) {
        msg =
          "Gemini quota/rate limit reached (429). The free tier allows only a limited number of requests per minute/day. Wait a minute (or until tomorrow), generate a smaller batch, switch to another model, or enable billing on your Google AI key.";
      } else if (lastError) {
        const busy = lastError.status === 503 ? " The model is busy — try again shortly or pick a different model." : "";
        msg = `AI provider error (${lastError.status}).${busy} ${(lastError.detail || "").slice(0, 200)}`;
      } else {
        msg = "The AI did not return any usable questions. Try again, a simpler topic, or a different model.";
      }
      save({ status: "error", error: msg });
    } else {
      // Finished (possibly short of target if quota ran out mid-run).
      save({ status: "done", questions: collected, error: lastError?.status === 429 ? "quota" : null });
    }
  } catch (err) {
    save(collected.length ? { status: "done", questions: collected } : { status: "error", error: err?.message || "AI request failed." });
  }
}

// POST /api/ai/generate  (admin)
// Body: { topic, notes, model, plan:[{type,difficulty,count}] }  (or legacy { count, difficulty, types })
// Starts a background job and returns { jobId, requested }. Poll /api/ai/job/:id.
export async function generateQuestions(req, res) {
  const key = (process.env.AI_API_KEY || "").trim();
  if (!key) {
    return res.status(400).json({
      message:
        "AI is not configured. Add AI_API_KEY (and optionally AI_BASE_URL, AI_MODEL) to the server environment.",
    });
  }

  const topic = String(req.body?.topic || "").trim();
  if (!topic) return res.status(400).json({ message: "A topic is required." });

  const notes = String(req.body?.notes || "").trim();
  const model = resolveModel(String(req.body?.model || "").trim());

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

  // Fire-and-forget — the client polls /api/ai/job/:id for progress.
  runGenerationJob(id, { key, model, topic, notes, plan, count, difficulty, types, target });

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
    model: job.model,
    error: job.error,
    questions: job.status === "done" ? job.questions : undefined,
  });
}


/* --------------------- Import questions from a website / text ---------------------
   The admin pastes a page URL and/or the copied text; the AI EXTRACTS the
   questions already present and returns them in the app schema for preview. */

const MAX_SOURCE_CHARS = 16000; // cap the material sent to the model

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
    'Extract EVERY exam/quiz question found in the material below and return them in the required JSON object {"questions":[...]}.',
    "Rules:",
    "- Only extract questions that are actually present — do NOT invent new questions.",
    "- Reproduce each question's stem and options faithfully.",
    "- If fewer than 4 options exist, complete them sensibly to 4; if more, keep the 4 most relevant.",
    "- If the correct answer is indicated (marked, 'Ans:', bold, an answer key, etc.), set \"correct\" to it; otherwise pick the best correct option.",
    "- Add a short explanation and brief per-option notes where possible.",
    "- Preserve Assertion/Reason, matching columns, and tables using the proper fields.",
    "",
    "SOURCE MATERIAL:",
    sourceText,
  ].join("\n");
}

// POST /api/ai/extract  (admin)
// Body: { url?, content?, model? } — returns { questions, model }.
export async function extractQuestions(req, res) {
  const key = (process.env.AI_API_KEY || "").trim();
  if (!key) {
    return res.status(400).json({
      message: "AI is not configured. Add AI_API_KEY to the server environment.",
    });
  }

  const model = resolveModel(String(req.body?.model || "").trim());
  const url = String(req.body?.url || "").trim();
  let content = String(req.body?.content || "").trim();

  // Optionally pull text from a page URL.
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

  const r = await callProvider({
    key,
    model,
    userPrompt: buildExtractPrompt(source),
    maxTokens: 16000,
  });
  if (!r.ok) {
    const hint =
      r.status === 429 ? " Quota/rate limit reached — wait a moment or use a different model." : "";
    return res.status(502).json({ message: `AI provider error (${r.status}).${hint} ${(r.detail || "").slice(0, 200)}` });
  }

  const questions = normalize(parseQuestions(r.content));
  if (!questions.length) {
    return res.status(422).json({
      message:
        "No questions could be extracted from that source. Make sure the page/text actually contains questions, or paste them directly.",
    });
  }
  res.json({ questions, model });
}
