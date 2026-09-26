// Characterization + unit tests for the pure helpers in
// src/controllers/aiController.js.
//
// aiController.js is the largest file in the codebase (~6.3k lines) and, before
// these tests, was almost entirely uncovered. The functions below are the
// deterministic core of the generation pipeline — JSON repair, model-output
// parsing, pair/column extraction, duplicate-detection primitives and
// model/quota classification. They take plain values in and return plain values
// out (no DB, network or req/res), so they can be pinned down in isolation.
//
// These tests are written as *characterization* tests: the expected values were
// captured from the code's current, shipping behaviour. Their job is to lock in
// that behaviour so this giant file can be safely carved into smaller modules
// without silent regressions. Where current behaviour is surprising (e.g.
// parseQuestions on a truncated array), the test documents it explicitly rather
// than asserting what we might *wish* it did.

import { describe, it, expect, beforeEach } from "vitest";
import {
  // JSON repair pipeline
  escapeRawControlCharsInStrings,
  escapeLatexBackslashes,
  repairJson,
  reviveLatex,
  deepReviveLatex,
  // model-output parsing / salvage
  salvageObjects,
  parseQuestions,
  parseStringArray,
  // pair / matching column extraction
  splitPairString,
  derivePairColumns,
  splitCombinedIfNeeded,
  extractNumbered,
  extractRomanNumbered,
  // duplicate-detection primitives
  contentTokens,
  jaccard,
  correctAnswerNorm,
  // model selection + quota/error classification
  isWeakModel,
  retryWaitMs,
  isDailyQuotaLimit,
  quota429Message,
  pickPreferredModel,
  // access-control + usage tracking (already public)
  resolveScope,
  aiRecentUsage,
  aiRecordUsage,
} from "../../src/controllers/aiController.js";

// ---------------------------------------------------------------------------
// JSON repair pipeline
// ---------------------------------------------------------------------------
describe("escapeLatexBackslashes + repairJson", () => {
  it("preserves single-backslash LaTeX that a naive JSON.parse would silently corrupt", () => {
    // Models routinely emit \frac / \times with a SINGLE backslash inside JSON
    // strings. Crucially this is still *parseable* JSON — \f and \t are legal
    // escapes — but a naive parse destroys the command (\f -> form-feed,
    // \t -> tab), which is the real bug. repairJson doubles the backslash first
    // so the LaTeX command survives intact.
    const broken = '{"exp":"Use \\frac{1}{2} and \\times here"}';

    // Naive parse succeeds but the "\frac"/"\times" commands are gone.
    const naive = JSON.parse(broken);
    expect(naive.exp).not.toContain("\\frac");
    expect(naive.exp).not.toContain("\\times");

    // Repaired parse keeps the literal backslash commands.
    const parsed = JSON.parse(repairJson(broken));
    expect(parsed.exp).toBe("Use \\frac{1}{2} and \\times here");
  });

  it("preserves genuine JSON escapes (\\\" \\\\ \\/ \\uXXXX)", () => {
    const src = '{"a":"quote:\\" slash:\\/ back:\\\\ uni:\\u00e9"}';
    const parsed = JSON.parse(repairJson(src));
    expect(parsed.a).toBe('quote:" slash:/ back:\\ uni:\u00e9');
  });

  it("leaves backslashes that sit OUTSIDE string literals untouched", () => {
    // A backslash between tokens (not inside a "...") should not be doubled.
    const src = '{"n": 1}';
    expect(escapeLatexBackslashes(src)).toBe(src);
  });

  it("tolerates empty / nullish input", () => {
    expect(escapeLatexBackslashes("")).toBe("");
    expect(escapeLatexBackslashes(null)).toBe("");
    expect(repairJson("")).toBe("");
  });
});

describe("escapeRawControlCharsInStrings", () => {
  it("escapes raw newlines/tabs/CR that appear inside a JSON string literal", () => {
    // A literal newline inside the quoted value is illegal JSON; the repair
    // turns it into a \n escape so JSON.parse works.
    const withRawNewline = '{"t":"line1\nline2\ttabbed"}';
    expect(() => JSON.parse(withRawNewline)).toThrow();
    const parsed = JSON.parse(escapeRawControlCharsInStrings(withRawNewline));
    expect(parsed.t).toBe("line1\nline2\ttabbed");
  });

  it("does not touch structural whitespace outside strings", () => {
    const src = '{\n  "a": 1\n}';
    // The newlines here are structural (between tokens), not inside a string,
    // so the result must still parse to the same object.
    expect(JSON.parse(escapeRawControlCharsInStrings(src))).toEqual({ a: 1 });
  });
});

describe("reviveLatex", () => {
  it("turns arrow commands into their unicode glyphs", () => {
    expect(reviveLatex("A \\rightarrow B")).toBe("A → B");
    expect(reviveLatex("A \\leftarrow B")).toBe("A ← B");
    expect(reviveLatex("A \\leftrightarrow B")).toBe("A ↔ B");
  });

  it("revives a control char that ate a LaTeX command back into the command", () => {
    // \times, single-backslash-parsed, becomes TAB + 'imes'. reviveLatex must
    // restore it to the literal command "\times".
    const corrupted = "\times x"; // TAB + "imes x"
    expect(reviveLatex(corrupted)).toBe("\\times x");
  });

  it("leaves a genuine newline alone and passes non-strings through", () => {
    expect(reviveLatex("line1\nline2")).toBe("line1\nline2");
    expect(reviveLatex(42)).toBe(42);
    expect(reviveLatex(null)).toBe(null);
  });
});

describe("deepReviveLatex", () => {
  it("recurses through arrays and objects, reviving every string", () => {
    const input = { q: "A \\to B", opts: ["x \\rightarrow y", 3], n: 7 };
    expect(deepReviveLatex(input)).toEqual({ q: "A → B", opts: ["x → y", 3], n: 7 });
  });

  it("returns primitives unchanged", () => {
    expect(deepReviveLatex(5)).toBe(5);
    expect(deepReviveLatex(true)).toBe(true);
    expect(deepReviveLatex(null)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Model-output parsing / salvage
// ---------------------------------------------------------------------------
describe("salvageObjects", () => {
  it("extracts every complete object that has a text or options field", () => {
    const text = 'junk {"text":"Q1"} mid {"nope":1} {"options":[1]} tail';
    expect(salvageObjects(text)).toEqual([{ text: "Q1" }, { options: [1] }]);
  });

  it("recovers the finished objects from a truncated array", () => {
    // The model ran out of tokens mid-second-object; the first, complete object
    // is still recoverable.
    const truncated = '[{"text":"A","options":[1]},{"text":"B"';
    expect(salvageObjects(truncated)).toEqual([{ text: "A", options: [1] }]);
  });

  it("returns [] when nothing complete/relevant is present", () => {
    expect(salvageObjects("no braces here")).toEqual([]);
    expect(salvageObjects('{"unrelated":true}')).toEqual([]);
  });
});

describe("parseQuestions", () => {
  it("parses a fenced ```json array", () => {
    const content = '```json\n[{"text":"Q1","options":["a"]}]\n```';
    expect(parseQuestions(content)).toEqual([{ text: "Q1", options: ["a"] }]);
  });

  it("unwraps a { questions: [...] } envelope", () => {
    expect(parseQuestions('{"questions":[{"text":"Q"}]}')).toEqual([{ text: "Q" }]);
  });

  it("returns a plain array as-is", () => {
    expect(parseQuestions('[{"text":"A"}]')).toEqual([{ text: "A" }]);
  });

  it("returns [] for non-JSON junk", () => {
    expect(parseQuestions("not json at all")).toEqual([]);
    expect(parseQuestions("")).toEqual([]);
  });

  it("CHARACTERIZATION: a truncated array yields [] (slice recovers a single object, not an array)", () => {
    // Documents current behaviour: parseQuestions slices out the first complete
    // object, which is NOT an array and has no `questions` key, so it returns [].
    // (salvageObjects, tested above, is what actually recovers such fragments.)
    expect(parseQuestions('[{"text":"A","options":[1]},{"text":"B"')).toEqual([]);
  });

  it("revives single-backslash LaTeX arrows while parsing", () => {
    const content = '[{"text":"A \\rightarrow B"}]';
    expect(parseQuestions(content)).toEqual([{ text: "A → B" }]);
  });
});

describe("parseStringArray", () => {
  it("parses a JSON array and trims each entry", () => {
    expect(parseStringArray('["a","b"," c "]')).toEqual(["a", "b", "c"]);
  });

  it("falls back to line parsing, stripping bullet/number markers", () => {
    expect(parseStringArray("- one\n2) two\n* three")).toEqual(["one", "two", "three"]);
  });

  it("strips a ```json code fence before parsing", () => {
    expect(parseStringArray('```json\n["x","y"]\n```')).toEqual(["x", "y"]);
  });

  it("drops entries shorter than 3 chars in line mode and caps at 40", () => {
    const many = Array.from({ length: 50 }, (_, i) => `item-${i}`).join("\n");
    const out = parseStringArray(many);
    expect(out).toHaveLength(40);
    // A too-short line ("ab") is filtered out.
    expect(parseStringArray("ab\nlong enough")).toEqual(["long enough"]);
  });

  it("returns [] for empty input", () => {
    expect(parseStringArray("")).toEqual([]);
    expect(parseStringArray(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pair / matching column extraction
// ---------------------------------------------------------------------------
describe("splitPairString", () => {
  it("splits on the first dash/arrow/colon separator", () => {
    expect(splitPairString("Dal Lake — Srinagar")).toEqual(["Dal Lake", "Srinagar"]);
    expect(splitPairString("A -> B")).toEqual(["A", "B"]);
    expect(splitPairString("Term: Meaning")).toEqual(["Term", "Meaning"]);
  });

  it("returns the whole string with an empty right side when no separator", () => {
    expect(splitPairString("NoSeparator")).toEqual(["NoSeparator", ""]);
  });
});

describe("derivePairColumns", () => {
  it("uses columnA/columnB when both are populated", () => {
    expect(derivePairColumns({ columnA: ["A", "B"], columnB: ["1", "2"] }))
      .toEqual({ columnA: ["A", "B"], columnB: ["1", "2"] });
  });

  it("recovers pairs from an alternate 'pairs' key of {left,right} objects", () => {
    const q = { pairs: [{ left: "A", right: "1" }, { left: "B", right: "2" }] };
    expect(derivePairColumns(q)).toEqual({ columnA: ["A", "B"], columnB: ["1", "2"] });
  });

  it("recovers pairs from [left, right] tuples", () => {
    const q = { matches: [["A", "1"], ["B", "2"]] };
    expect(derivePairColumns(q)).toEqual({ columnA: ["A", "B"], columnB: ["1", "2"] });
  });

  it("splits a single combined column of 'Left — Right' strings", () => {
    const q = { columnA: ["X — 1", "Y — 2"], columnB: [] };
    expect(derivePairColumns(q)).toEqual({ columnA: ["X", "Y"], columnB: ["1", "2"] });
  });
});

describe("splitCombinedIfNeeded", () => {
  it("splits when only column A is filled and every item is a combined pair", () => {
    expect(splitCombinedIfNeeded(["X - 1", "Y - 2"], []))
      .toEqual({ columnA: ["X", "Y"], columnB: ["1", "2"] });
  });

  it("leaves already-separated columns untouched", () => {
    expect(splitCombinedIfNeeded(["X", "Y"], ["1", "2"]))
      .toEqual({ columnA: ["X", "Y"], columnB: ["1", "2"] });
  });
});

describe("extractNumbered", () => {
  it("extracts an intro plus numbered statements", () => {
    const out = extractNumbered("Consider the following:\n1. First\n2. Second\n3. Third");
    expect(out).toEqual({ intro: "Consider the following:", statements: ["First", "Second", "Third"] });
  });

  it("returns null when there are fewer than two numbered items", () => {
    expect(extractNumbered("1. lonely")).toBeNull();
    expect(extractNumbered("just prose, no numbers")).toBeNull();
  });

  it("returns null when the numbering does not start at 1", () => {
    expect(extractNumbered("2. two\n3. three")).toBeNull();
  });
});

describe("extractRomanNumbered", () => {
  it("extracts roman-numeral statements", () => {
    const out = extractRomanNumbered("Order: I. Alpha II. Beta III. Gamma");
    expect(out).toEqual({ intro: "Order:", statements: ["Alpha", "Beta", "Gamma"] });
  });

  it("returns null when not starting at I or fewer than two items", () => {
    expect(extractRomanNumbered("II. two III. three")).toBeNull();
    expect(extractRomanNumbered("I. only one")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Duplicate-detection primitives
// ---------------------------------------------------------------------------
describe("contentTokens", () => {
  it("keeps meaningful words (>=4 chars) and drops stopwords + inline math", () => {
    const tokens = contentTokens("The photosynthesis process in plants $x^2$");
    expect(tokens).toEqual(new Set(["photosynthesis", "process", "plants"]));
  });

  it("returns an empty set for empty input", () => {
    expect(contentTokens("")).toEqual(new Set());
  });
});

describe("jaccard", () => {
  it("computes intersection over union", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3, 10);
  });

  it("is 1 for identical sets and 0 when either is empty", () => {
    expect(jaccard(new Set(["a"]), new Set(["a"]))).toBe(1);
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("correctAnswerNorm", () => {
  it("normalises the correct option to lowercase alphanumerics", () => {
    expect(correctAnswerNorm({ options: ["Foo!", "Bar"], correct: 0 })).toBe("foo");
  });

  it("returns empty string when there is no resolvable correct option", () => {
    expect(correctAnswerNorm({})).toBe("");
    expect(correctAnswerNorm({ options: ["a"], correct: 5 })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Model selection + quota / error classification
// ---------------------------------------------------------------------------
describe("isWeakModel", () => {
  it("flags lite/preview/experimental/thinking/nano/research models", () => {
    expect(isWeakModel("gemini-2.5-flash-lite")).toBe(true);
    expect(isWeakModel("deep-research-max-preview")).toBe(true);
    expect(isWeakModel("some-thinking-model")).toBe(true);
  });

  it("treats full models as strong", () => {
    expect(isWeakModel("gemini-2.5-flash")).toBe(false);
    expect(isWeakModel("gpt-4o-mini")).toBe(false);
  });
});

describe("isDailyQuotaLimit", () => {
  it("detects per-day quota messages", () => {
    expect(isDailyQuotaLimit("GenerateRequestsPerDay exceeded")).toBe(true);
    expect(isDailyQuotaLimit("free tier daily limit reached")).toBe(true);
  });

  it("does not flag per-minute rate limits", () => {
    expect(isDailyQuotaLimit("rate limit per minute")).toBe(false);
  });
});

describe("retryWaitMs", () => {
  const hdr = (map) => ({ get: (k) => (k in map ? map[k] : null) });

  it("uses the Retry-After header (seconds -> ms)", () => {
    expect(retryWaitMs(hdr({ "retry-after": "5" }), "")).toBe(5000);
  });

  it("falls back to Gemini's retryDelay body field", () => {
    // 27s -> 27000ms, capped at the 20000ms ceiling.
    expect(retryWaitMs(hdr({}), '"retryDelay":"27s"')).toBe(20000);
  });

  it("returns 0 when no hint is available and caps large header values", () => {
    expect(retryWaitMs(hdr({}), "no info")).toBe(0);
    expect(retryWaitMs(hdr({ "retry-after": "999" }), "")).toBe(20000);
  });
});

describe("quota429Message", () => {
  it("explains a daily quota exhaustion (resets tomorrow)", () => {
    const msg = quota429Message("per day quota exceeded");
    expect(msg).toMatch(/resets tomorrow/i);
    expect(msg).toMatch(/same .*account share one quota/i);
  });

  it("explains a per-minute rate limit (clears within a minute)", () => {
    expect(quota429Message("rate limit")).toMatch(/per-minute/i);
  });
});

describe("pickPreferredModel", () => {
  it("prefers a strong gemini-2.5-flash over weak/embedding models", () => {
    expect(pickPreferredModel(["text-embedding-3", "gemini-2.5-flash-lite", "gemini-2.5-flash"]))
      .toBe("gemini-2.5-flash");
  });

  it("falls back to a weak model when only weak ones remain", () => {
    expect(pickPreferredModel(["some-lite-model", "other-preview"])).toBe("some-lite-model");
  });

  it("filters out non-text models (whisper/vision/embed)", () => {
    expect(pickPreferredModel(["whisper-1", "gpt-4o-mini"])).toBe("gpt-4o-mini");
  });

  it("returns empty string for no models", () => {
    expect(pickPreferredModel([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Access-control scope resolution
// ---------------------------------------------------------------------------
describe("resolveScope", () => {
  it("gives non-clients and anonymous callers the platform pool", () => {
    const platform = { owner: null, includeEnv: true, mode: "inbuilt", access: true };
    expect(resolveScope(null)).toEqual(platform);
    expect(resolveScope({ role: "admin" })).toEqual(platform);
    expect(resolveScope({ role: "student" })).toEqual(platform);
  });

  it("denies a client with no AI access", () => {
    expect(resolveScope({ role: "client", aiAccess: false }))
      .toEqual({ owner: null, includeEnv: false, access: false, denied: true });
  });

  it("denies a client when BOTH pools are disabled", () => {
    expect(resolveScope({ role: "client", aiAccess: true, aiAllowInbuilt: false, aiAllowSelf: false }))
      .toMatchObject({ access: false, denied: true });
  });

  it("routes a 'self' client to their own key pool", () => {
    expect(resolveScope({ role: "client", aiAccess: true, _id: "u1", aiMode: "self" }, "self"))
      .toMatchObject({ owner: "u1", includeEnv: false, mode: "self", access: true });
  });

  it("routes an 'inbuilt' client to the platform pool", () => {
    expect(resolveScope({ role: "client", aiAccess: true, _id: "u1" }, "inbuilt"))
      .toMatchObject({ owner: null, includeEnv: true, mode: "inbuilt", access: true });
  });

  it("corrects a requested mode the admin disallows", () => {
    // Requested 'self' but self is disabled -> forced to inbuilt (platform).
    expect(resolveScope({ role: "client", aiAccess: true, _id: "u1", aiAllowSelf: false }, "self"))
      .toMatchObject({ mode: "inbuilt", owner: null, includeEnv: true });
    // Requested 'inbuilt' but inbuilt is disabled -> forced to self (own keys).
    expect(resolveScope({ role: "client", aiAccess: true, _id: "u1", aiAllowInbuilt: false }, "inbuilt"))
      .toMatchObject({ mode: "self", owner: "u1", includeEnv: false });
  });
});

// ---------------------------------------------------------------------------
// In-memory AI usage window
// ---------------------------------------------------------------------------
describe("aiRecentUsage + aiRecordUsage", () => {
  // Use a unique key per test so the shared in-memory map never leaks between
  // cases.
  let key;
  beforeEach(() => {
    key = `test-${Math.random().toString(36).slice(2)}`;
  });

  it("accumulates recorded counts within the window", () => {
    aiRecordUsage(key, 3);
    aiRecordUsage(key, 2);
    expect(aiRecentUsage(key, 60000)).toBe(5);
  });

  it("prunes events outside the window (a zero-width window sees nothing)", () => {
    aiRecordUsage(key, 4);
    expect(aiRecentUsage(key, 0)).toBe(0);
  });

  it("reports 0 for an unknown key", () => {
    expect(aiRecentUsage("never-seen", 60000)).toBe(0);
  });
});
