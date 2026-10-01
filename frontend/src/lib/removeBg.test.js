import { describe, it, expect } from "vitest";
import { removeBackground, borderColor } from "./removeBg.js";

// W×H image: white everywhere, a yellow square in the middle with a WHITE
// "eye" inside it (must be kept — it isn't connected to the outside).
function makeEmoji(W = 10, H = 10) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const inFace = x >= 2 && x <= 7 && y >= 2 && y <= 7;
    const eye = x === 4 && y === 4;
    const [r, g, b] = inFace && !eye ? [250, 200, 20] : [255, 255, 255];
    data.set([r, g, b, 255], i);
  }
  return { data, width: W, height: H };
}
const alpha = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

describe("removeBackground", () => {
  it("finds the border colour", () => {
    expect(borderColor(makeEmoji())).toEqual([255, 255, 255]);
  });
  it("clears the outside white but keeps the face and the white eye", () => {
    const img = makeEmoji();
    expect(removeBackground(img)).toBeGreaterThan(0);
    expect(alpha(img, 0, 0)).toBe(0);
    expect(alpha(img, 9, 9)).toBe(0);
    expect(alpha(img, 3, 3)).toBe(255); // yellow face
    expect(alpha(img, 4, 4)).toBe(255); // white eye inside the face
  });
  it("does nothing on an already transparent image", () => {
    const img = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
    expect(removeBackground(img)).toBe(0);
  });
});
