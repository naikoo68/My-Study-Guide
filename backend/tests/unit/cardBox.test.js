import { describe, it, expect } from "vitest";
import { cleanCardBox, cardBoxParam, cardBoxLogo } from "../../src/utils/cardBox.js";

describe("cleanCardBox", () => {
  it("opacities: clamped, text never below 10%, card can be 0", () => {
    expect(cleanCardBox({ top: 0.2, bottom: 0.2, side: 0, card: 0, text: 0 })).toMatchObject({ card: 0, text: 0.1 });
    expect(cleanCardBox({ top: 0.2, bottom: 0.2, side: 0, card: 7, text: "x" })).toMatchObject({ card: 1, text: 1 });
  });
  it("null / junk → null (defaults)", () => {
    expect(cleanCardBox(null)).toBe(null);
    expect(cleanCardBox({ top: "x", bottom: 0.1, side: 0.1 })).toBe(null);
    expect(cleanCardBox({ top: 0.1 })).toBe(null);
  });
  it("keeps valid values (rounded)", () => {
    expect(cleanCardBox({ top: 0.2234, bottom: "0.19", side: 0.05 })).toEqual({ top: 0.223, bottom: 0.19, side: 0.05, card: 0.94, text: 1 });
  });
  it("clamps so the card always keeps room", () => {
    const b = cleanCardBox({ top: 0.45, bottom: 0.45, side: 0.9 });
    expect(b.top + b.bottom).toBeLessThanOrEqual(0.7001);
    expect(b.side).toBe(0.3);
  });
  it("param string", () => {
    expect(cardBoxParam({ top: 0.22, bottom: 0.19, side: 0.06 })).toBe("0.22,0.19,0.06,0.94,1");
    expect(cardBoxParam({ top: 0.22, bottom: 0.19, side: 0.06, card: 0.5, text: 0.8 })).toBe("0.22,0.19,0.06,0.5,0.8");
    expect(cardBoxParam(null)).toBe("");
  });
});

describe("logo on the template", () => {
  it("keeps a valid logo, clamps it on-frame", () => {
    const b = cleanCardBox({ top: 0.2, bottom: 0.2, side: 0, logo: { url: "https://res.cloudinary.com/a/l.png", x: 0.95, y: -1, w: 0.2, opacity: 0 } });
    expect(b.logo).toEqual({ url: "https://res.cloudinary.com/a/l.png", w: 0.2, x: 0.8, y: 0, opacity: 0.05 });
    expect(cardBoxLogo({ top: 0.2, bottom: 0.2, side: 0, logo: { url: "https://x.com/l.png", x: 0.1, y: 0.1, w: 0.1, opacity: 0.5 } })).toEqual({ url: "https://x.com/l.png", pos: "0.1,0.1,0.1,0.5" });
  });
  it("drops unsafe / missing logos", () => {
    expect(cleanCardBox({ top: 0.2, bottom: 0.2, side: 0, logo: { url: "javascript:alert(1)" } }).logo).toBeUndefined();
    expect(cardBoxLogo({ top: 0.2, bottom: 0.2, side: 0 })).toBe(null);
  });
});
