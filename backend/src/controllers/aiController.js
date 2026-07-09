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

function buildUserPrompt({ topic, count, difficulty, types, notes }) {
  const allowed = (types && types.length ? types : ["mcq"]).join(", ");
  const diffLine =
    difficulty && DIFFS.includes(difficulty)
      ? `All questions must be "${difficulty}" difficulty.`
      : `Mix the difficulty across Easy, Medium and Hard.`;
  return [
    `Generate ${count} exam-prep questions.`,
    `Topic / syllabus: ${topic}.`,
    `Allowed question types: ${allowed}. Prefer "mcq" unless another type fits better.`,
    diffLine,
    notes ? `Extra instructions: ${notes}` : "",
    `Return ONLY the JSON object {"questions":[...]}.`,
  ]
    .filter(Boolean)
    .join("\n");
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
  if (!obj) return [];
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

// POST /api/ai/generate  (admin)
// Body: { topic, count, difficulty, types:[], notes }
// Returns { questions:[...] } — NOT saved; the admin previews then inserts.
export async function generateQuestions(req, res) {
  const key = (process.env.AI_API_KEY || "").trim(); // trim stray spaces/newlines from env
  if (!key) {
    return res.status(400).json({
      message:
        "AI is not configured. Add AI_API_KEY (and optionally AI_BASE_URL, AI_MODEL) to the server environment.",
    });
  }

  const topic = String(req.body?.topic || "").trim();
  if (!topic) return res.status(400).json({ message: "A topic is required." });

  const count = Math.min(30, Math.max(1, parseInt(req.body?.count, 10) || 5));
  const difficulty = req.body?.difficulty;
  const types = Array.isArray(req.body?.types)
    ? req.body.types.filter((t) => TYPES.includes(t))
    : [];
  const notes = String(req.body?.notes || "").trim();
  const model = resolveModel(String(req.body?.model || "").trim());

  // max_tokens is REQUIRED by Anthropic/Claude models and prevents the JSON
  // reply from being truncated for larger batches. Scale it with the count,
  // capped at a safe ceiling.
  const maxTokens = Math.min(16000, 1200 + count * 550);

  const payload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt({ topic, count, difficulty, types, notes }) },
    ],
    temperature: 0.6,
    max_tokens: maxTokens,
  };

  try {
    const resp = await fetch(`${BASE_URL()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return res
        .status(502)
        .json({ message: `AI provider error (${resp.status}). ${detail.slice(0, 300)}` });
    }

    const data = await resp.json();
    const content = extractContent(data);
    const questions = normalize(parseQuestions(content));

    if (!questions.length) {
      return res.status(422).json({
        message:
          "The AI replied but no questions could be read from its output. Try a lower count, a simpler topic, or a different model (e.g. gpt-4o-mini).",
      });
    }
    res.json({ questions, model });
  } catch (err) {
    res.status(502).json({ message: err?.message || "AI request failed." });
  }
}
