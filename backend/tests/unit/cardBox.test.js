import { describe, it, expect } from "vitest";
import { cleanCardBox, cardBoxParam } from "../../src/utils/cardBox.js";

describe("cleanCardBox", () => {
  it("null / junk → null (defaults)", () => {
    expect(cleanCardBox(null)).toBe(null);
    expect(cleanCardBox({ top: "x", bottom: 0.1, side: 0.1 })).toBe(null);
    expect(cleanCardBox({ top: 0.1 })).toBe(null);
  });
  it("keeps valid values (rounded)", () => {
    expect(cleanCardBox({ top: 0.2234, bottom: "0.19", side: 0.05 })).toEqual({ top: 0.223, bottom: 0.19, side: 0.05 });
  });
  it("clamps so the card always keeps room", () => {
    const b = cleanCardBox({ top: 0.45, bottom: 0.45, side: 0.9 });
    expect(b.top + b.bottom).toBeLessThanOrEqual(0.7001);
    expect(b.side).toBe(0.3);
  });
  it("param string", () => {
    expect(cardBoxParam({ top: 0.22, bottom: 0.19, side: 0.06 })).toBe("0.22,0.19,0.06");
    expect(cardBoxParam(null)).toBe("");
  });
});
