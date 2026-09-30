// Batching helpers for the bulk "Extend all" / "Regenerate all" jobs, so they
// work like question GENERATION: several questions per AI call and the long
// rule text sent ONCE per call instead of once per question. Pure — unit-tested.

// Questions per call — two modes, chosen in the Extend / Regenerate dialog:
//  "spread" (default) — EXACTLY like question generation: ceil(total / keys),
//                        1 to 12 per call, so every key gets work. A small quiz
//                        uses many keys with 1–2 questions each; a big one
//                        (29 keys × 12 = 348+) gets 12 per call on every key.
//  "max"              — always 12 per call (fewer, bigger requests; on a small
//                        quiz only a few keys are needed).
export const REWRITE_MAX_CHUNK = 12;
export const BATCH_MODES = ["spread", "max"];
export function rewriteChunkSize(total, keyCount, mode = "spread") {
  if (mode === "max") return REWRITE_MAX_CHUNK;
  const n = Math.ceil(Math.max(1, Number(total) || 1) / Math.max(1, Number(keyCount) || 1));
  return Math.max(1, Math.min(REWRITE_MAX_CHUNK, n));
}

// Output budget for one call: about 2.4k tokens per question (a detailed
// explanation plus notes is typically 0.8–2k), capped at 16k like generation
// (so a 12-question call gets ~1.2k each; any item a truncated reply misses is
// salvaged / re-queued by the job). The old fixed
// 7k per question reserved far more than a reply ever uses, and big
// reservations get rate-limited sooner on the gateway.
export const REWRITE_TOKENS_PER_QUESTION = 2400;
export function rewriteMaxTokens(n) {
  return Math.min(16000, 1500 + Math.max(1, n) * REWRITE_TOKENS_PER_QUESTION);
}

// Instruction lines are long and IDENTICAL for every question in a job (same
// toggles), while the question data lines (type, stem, options, existing
// explanation) differ. A line counts as a shared rule only if it is long AND
// appears in every question's prompt, so short repeated data such as
// "A) True" is never pulled out.
const RULE_MIN_LEN = 160;

// prompts: one normal single-question prompt per question (strings).
// Returns { shared: string[], blocks: string[] }: the rule lines common to
// all of them, and each prompt with those lines removed.
export function splitSharedRules(prompts) {
  const list = (Array.isArray(prompts) ? prompts : []).map((p) => String(p ?? ""));
  if (list.length < 2) return { shared: [], blocks: list };
  const lineSets = list.map((p) => new Set(p.split("\n")));
  const shared = list[0].split("\n").filter((l, i, arr) =>
    l.length >= RULE_MIN_LEN && arr.indexOf(l) === i && lineSets.every((s) => s.has(l)));
  if (!shared.length) return { shared: [], blocks: list };
  const drop = new Set(shared);
  const blocks = list.map((p) => p.split("\n").filter((l) => !drop.has(l)).join("\n"));
  return { shared, blocks };
}

// The user prompt for one batched call.
export function buildBatchRewritePrompt(chunk, perQuestionPrompt) {
  const { shared, blocks } = splitSharedRules(chunk.map((q) => perQuestionPrompt(q)));
  const out = [
    'You are given MULTIPLE exam questions below, each under a header "### QUESTION <n>". Treat each COMPLETELY INDEPENDENTLY and apply the rules to it, then return the single {"items":[...]} object described in the system message.',
    "",
  ];
  if (shared.length) {
    out.push("=== RULES FOR EVERY QUESTION BELOW (apply them to EACH question separately) ===");
    out.push(...shared);
    out.push("");
  }
  blocks.forEach((b, i) => {
    out.push(`### QUESTION ${i + 1}`);
    out.push(b);
    out.push("");
  });
  return out.join("\n");
}
