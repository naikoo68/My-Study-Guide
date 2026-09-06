import { describe, it, expect, afterEach, vi } from "vitest";
import { loadNav, saveNav } from "./navState.js";

// Minimal in-memory sessionStorage stub (the tests run in a Node environment).
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("navState with working sessionStorage", () => {
  it("round-trips a saved navigation object", () => {
    vi.stubGlobal("sessionStorage", makeStorage());
    saveNav("admin-content", { stream: "s1", subject: "sub2" });
    expect(loadNav("admin-content")).toEqual({ stream: "s1", subject: "sub2" });
  });

  it("returns {} for a key that was never saved", () => {
    vi.stubGlobal("sessionStorage", makeStorage());
    expect(loadNav("missing")).toEqual({});
  });

  it("returns {} when the stored value is invalid JSON", () => {
    const storage = makeStorage();
    storage.setItem("bad", "{not json");
    vi.stubGlobal("sessionStorage", storage);
    expect(loadNav("bad")).toEqual({});
  });
});

describe("navState when storage is unavailable", () => {
  it("loadNav returns {} and saveNav does not throw", () => {
    // No sessionStorage global in this environment.
    expect(loadNav("anything")).toEqual({});
    expect(() => saveNav("anything", { a: 1 })).not.toThrow();
  });
});
