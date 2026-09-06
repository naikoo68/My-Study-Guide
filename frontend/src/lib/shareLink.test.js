import { describe, it, expect, afterEach, vi } from "vitest";
import { publicShareUrl } from "./shareLink.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publicShareUrl", () => {
  it("uses the SEO /s/:token path on a real (non-local) host", () => {
    vi.stubGlobal("window", {
      location: { hostname: "www.mystudyguide.in", origin: "https://www.mystudyguide.in" },
    });
    expect(publicShareUrl("tok123", "test")).toBe("https://www.mystudyguide.in/s/tok123");
    expect(publicShareUrl("tok123", "quiz")).toBe("https://www.mystudyguide.in/s/tok123");
  });

  it("falls back to the in-app hash route on localhost", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", origin: "http://localhost:5173" },
    });
    expect(publicShareUrl("t1", "quiz")).toBe("http://localhost:5173/public/quiz/t1");
    expect(publicShareUrl("t1", "My Quiz")).toBe("http://localhost:5173/public/quiz/t1");
    expect(publicShareUrl("t1", "test")).toBe("http://localhost:5173/public/test/t1");
  });

  it("treats 127.x / 0.0.0.0 as local", () => {
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1", origin: "http://127.0.0.1:3000" },
    });
    expect(publicShareUrl("t2", "test")).toBe("http://127.0.0.1:3000/public/test/t2");
  });

  it("degrades to a relative in-app path when there is no window", () => {
    // no window stubbed → non-browser environment
    expect(publicShareUrl("t3", "quiz")).toBe("/public/quiz/t3");
    expect(publicShareUrl("t3", "test")).toBe("/public/test/t3");
  });
});
