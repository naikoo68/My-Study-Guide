import { describe, it, expect } from "vitest";
import { selectAutoComments } from "../../src/utils/autoComments.js";

const LIST = ["First!", "Great question 👇", "Follow for more"];

describe("selectAutoComments — rotate (default)", () => {
  it("returns one comment and advances the pointer", () => {
    expect(selectAutoComments(LIST, "rotate", 0)).toEqual({ comments: ["First!"], nextIndex: 1 });
    expect(selectAutoComments(LIST, "rotate", 1)).toEqual({ comments: ["Great question 👇"], nextIndex: 2 });
  });

  it("wraps around when the pointer exceeds the list length", () => {
    expect(selectAutoComments(LIST, "rotate", 3).comments).toEqual(["First!"]);
    expect(selectAutoComments(LIST, "rotate", 4).comments).toEqual(["Great question 👇"]);
  });

  it("handles a negative / non-finite pointer safely", () => {
    expect(selectAutoComments(LIST, "rotate", -1).comments).toEqual(["Follow for more"]);
    expect(selectAutoComments(LIST, "rotate", NaN).comments).toEqual(["First!"]);
  });

  it("defaults to rotate when no mode is given", () => {
    expect(selectAutoComments(LIST, undefined, 0)).toEqual({ comments: ["First!"], nextIndex: 1 });
  });
});

describe("selectAutoComments — all", () => {
  it("returns every comment and leaves the pointer unchanged", () => {
    expect(selectAutoComments(LIST, "all", 5)).toEqual({ comments: LIST, nextIndex: 5 });
  });
});

describe("selectAutoComments — random", () => {
  it("returns exactly one comment from the list and does not advance", () => {
    const r = selectAutoComments(LIST, "random", 2, () => 0.5);
    expect(r.comments).toHaveLength(1);
    expect(LIST).toContain(r.comments[0]);
    expect(r.nextIndex).toBe(2);
  });

  it("uses the injected RNG deterministically", () => {
    expect(selectAutoComments(LIST, "random", 0, () => 0).comments).toEqual(["First!"]);
    expect(selectAutoComments(LIST, "random", 0, () => 0.99).comments).toEqual(["Follow for more"]);
  });
});

describe("selectAutoComments — cleaning & guards", () => {
  it("trims and drops blank entries", () => {
    const r = selectAutoComments(["  hi  ", "", "   ", "there"], "all", 0);
    expect(r.comments).toEqual(["hi", "there"]);
  });

  it("returns nothing (pointer preserved) for an empty list", () => {
    expect(selectAutoComments([], "rotate", 7)).toEqual({ comments: [], nextIndex: 7 });
    expect(selectAutoComments(null, "all", 0)).toEqual({ comments: [], nextIndex: 0 });
  });
});
