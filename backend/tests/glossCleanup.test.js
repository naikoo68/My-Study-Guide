import { describe, it, expect } from "vitest";
import { isGlossOnlyEdit } from "../src/utils/glossEdit.js";
import { buildExtendSet, buildRegenSet, EXTEND_SYSTEM_PROMPT, REGEN_SYSTEM_PROMPT } from "../src/controllers/aiController.js";

// The question from the screenshot (Q24).
const q = {
  type: "mcq",
  text: "Which of the following expenditures is classified as a finance cost (vittiya lagat) in a corporate income statement?",
  options: ["Insurance Expense (bima vyay)", "Amortization (aplekhit mulya; 'amurt sampatti hras')", "Bad Debts (asodhya rin; 'dubat khata')", "Interest Expense (byaj vyay)"],
  correct: 3,
};
const clean = {
  text: "Which of the following expenditures is classified as a finance cost in a corporate income statement?",
  options: ["Insurance Expense", "Amortization", "Bad Debts", "Interest Expense"],
};

describe("gloss-only edits", () => {
  it("accepts dropping / trimming brackets and nothing else", () => {
    expect(isGlossOnlyEdit(q.options[1], "Amortization")).toBe(true);
    expect(isGlossOnlyEdit("'Non-Operating Income' (income from secondary activities; 'gair-sanchalan aay') for", "'Non-Operating Income' (income from secondary activities) for")).toBe(true);
    expect(isGlossOnlyEdit("Interest Expense (byaj vyay)", "Finance Cost")).toBe(false);
    expect(isGlossOnlyEdit("Interest on 5000 (byaj)", "Interest on 6000")).toBe(false);
  });
  it("keeps a historically important term the AI keeps", () => {
    expect(isGlossOnlyEdit("Bahi-Khata (traditional Indian ledger)", "Bahi-Khata (traditional Indian ledger)")).toBe(true);
  });
});

describe("Extend explanation removes the glosses", () => {
  it("cleans stem + options, keeps the answer, and strips repeats from the explanation", () => {
    const parsed = {
      ...clean,
      explanation: "Interest Expense (byaj vyay) is the cost of borrowing funds.\nInsurance Expense (bima vyay) is an administrative cost.",
      optionExplanations: ["Insurance Expense (bima vyay) is an operating overhead.", "Amortization is an operating expense.", "Bad Debts (asodhya rin; 'dubat khata') is an operating loss.", ""],
      keyPoints: ["Interest Expense (byaj vyay) = finance cost"],
      quickRecall: "Borrowing cost = finance cost",
    };
    const set = buildExtendSet(q, parsed, false, false);
    expect(set.text).toBe(clean.text);
    expect(set.options).toEqual(clean.options);
    expect(set.correct).toBeUndefined(); // answer untouched
    expect(set.explanation).not.toMatch(/byaj|bima/);
    expect(set.optionExplanations[0]).toBe("Insurance Expense is an operating overhead.");
    expect(set.optionExplanations[2]).toBe("Bad Debts is an operating loss.");
    expect(set.keyPoints[0]).toBe("Interest Expense = finance cost");
  });
  it("never lets Extend reword the question", () => {
    const set = buildExtendSet(q, { explanation: "x", text: "Which item is a finance cost?", options: ["Insurance", "Amortisation", "Bad Debts", "Loan Interest"] }, false, false);
    expect(set.text).toBeUndefined(); // a reworded stem is rejected
    // each option is judged on its own: reworded ones are kept as they were,
    // the one that only lost its gloss ("Bad Debts") is cleaned
    expect(set.options).toEqual([q.options[0], q.options[1], "Bad Debts", q.options[3]]);
  });
});

describe("Regenerate removes the glosses", () => {
  it("with 'fix options' OFF, the kept options still lose their glosses", () => {
    const set = buildRegenSet(q, { ...clean, explanation: "Interest Expense (byaj vyay) is a finance cost.", optionExplanations: ["", "", "", ""] }, { fixOptions: false, shuffleOptions: false });
    expect(set.text).toBe(clean.text);
    expect(set.options).toEqual(clean.options);
    expect(set.explanation).toBe("Interest Expense is a finance cost.");
  });
});

describe("the AI is told the rule", () => {
  it("Extend and Regenerate prompts forbid glosses except historical terms", () => {
    for (const p of [EXTEND_SYSTEM_PROMPT, REGEN_SYSTEM_PROMPT]) {
      expect(p).toMatch(/NO HINDI \/ VERNACULAR GLOSSES/);
      expect(p).toMatch(/HISTORICALLY important/);
      expect(p).toMatch(/Bahi-Khata/);
      expect(p).not.toMatch(/common local or vernacular \(Hindi\/regional\) name/);
    }
  });
});
