import { describe, it, expect } from "vitest";
import { displayName, displayTrail } from "../src/utils/displayName.js";

describe("displayName — drops the list-order prefix", () => {
  it.each([
    ["A) Basic Terminologies", "Basic Terminologies"],
    ["B) JKSSB", "JKSSB"],
    ["a) Journal Entries", "Journal Entries"],
    ["(C) Ledger", "Ledger"],
    ["1) Introduction", "Introduction"],
    ["12. Trial Balance", "Trial Balance"],
    ["A. Basic Terms", "Basic Terms"],
    ["A - Basics", "Basics"],
    ["2 – Accounts", "Accounts"],
    ["A)Basic", "Basic"],
  ])("%s → %s", (input, out) => expect(displayName(input)).toBe(out));

  it.each([
    "Accounting", "Quiz 2", "U.S. History", "B.Com Accounts", "A Level Physics", "Class 10 Maths", "2024 Budget",
  ])("leaves %s alone", (name) => expect(displayName(name)).toBe(name));

  it("never empties a name and handles blanks", () => {
    expect(displayName("A)")).toBe("A)");
    expect(displayName("")).toBe("");
    expect(displayName(null)).toBe("");
  });

  it("cleans every part of a breadcrumb / title trail", () => {
    expect(displayTrail("My Quiz › A) JKSSB › Accounting › A) Basic Terminologies › Quiz 1"))
      .toBe("My Quiz › JKSSB › Accounting › Basic Terminologies › Quiz 1");
    expect(displayTrail("Accounting | A) Basic Terminologies")).toBe("Accounting | Basic Terminologies");
    expect(displayTrail("")).toBe("");
  });
});
