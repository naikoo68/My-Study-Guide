import { describe, it, expect, afterEach } from "vitest";
import {
  assertSafeProviderUrl,
  isSafeProviderUrl,
  assertSafePublicUrl,
  isSafePublicUrl,
} from "../../src/utils/urlGuard.js";

const ENV_KEYS = ["AI_PROVIDER_HOST_STRICT", "AI_PROVIDER_HOST_ALLOWLIST"];
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("isSafeProviderUrl", () => {
  it("allows known https provider hosts", () => {
    expect(isSafeProviderUrl("https://api.openai.com/v1")).toBe(true);
    expect(isSafeProviderUrl("https://generativelanguage.googleapis.com")).toBe(true);
  });

  it("rejects non-https schemes", () => {
    expect(isSafeProviderUrl("http://api.openai.com")).toBe(false);
    expect(isSafeProviderUrl("ftp://api.openai.com")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isSafeProviderUrl("not a url")).toBe(false);
    expect(isSafeProviderUrl("")).toBe(false);
  });

  it("blocks localhost and internal-only TLDs", () => {
    expect(isSafeProviderUrl("https://localhost")).toBe(false);
    expect(isSafeProviderUrl("https://foo.localhost")).toBe(false);
    expect(isSafeProviderUrl("https://svc.internal")).toBe(false);
    expect(isSafeProviderUrl("https://printer.local")).toBe(false);
  });

  it("blocks private / loopback / metadata IP literals", () => {
    expect(isSafeProviderUrl("https://127.0.0.1")).toBe(false); // loopback
    expect(isSafeProviderUrl("https://10.0.0.5")).toBe(false); // private
    expect(isSafeProviderUrl("https://172.16.9.9")).toBe(false); // private
    expect(isSafeProviderUrl("https://192.168.1.1")).toBe(false); // private
    expect(isSafeProviderUrl("https://169.254.169.254")).toBe(false); // cloud metadata
    expect(isSafeProviderUrl("https://[::1]")).toBe(false); // IPv6 loopback
  });

  it("allows a public IP literal when not in strict mode", () => {
    expect(isSafeProviderUrl("https://8.8.8.8")).toBe(true);
  });
});

describe("assertSafeProviderUrl", () => {
  it("returns the parsed URL for a safe input", () => {
    const u = assertSafeProviderUrl("https://api.openai.com/v1");
    expect(u).toBeInstanceOf(URL);
    expect(u.hostname).toBe("api.openai.com");
  });

  it("throws a descriptive error for metadata addresses", () => {
    expect(() => assertSafeProviderUrl("https://169.254.169.254")).toThrow(
      /private\/loopback\/metadata/
    );
  });

  it("enforces a strict allowlist when enabled", () => {
    process.env.AI_PROVIDER_HOST_STRICT = "true";
    expect(isSafeProviderUrl("https://api.openai.com")).toBe(true);
    expect(isSafeProviderUrl("https://evil.example.com")).toBe(false);
  });

  it("extends the strict allowlist via env", () => {
    process.env.AI_PROVIDER_HOST_STRICT = "true";
    process.env.AI_PROVIDER_HOST_ALLOWLIST = "my-proxy.example.com";
    expect(isSafeProviderUrl("https://my-proxy.example.com/v1")).toBe(true);
    expect(isSafeProviderUrl("https://api.my-proxy.example.com")).toBe(true); // subdomain
  });
});

describe("public URL guard", () => {
  it("allows both http and https for public pages", () => {
    expect(isSafePublicUrl("http://example.com/article")).toBe(true);
    expect(isSafePublicUrl("https://example.com/article")).toBe(true);
  });

  it("still blocks internal/metadata targets", () => {
    expect(isSafePublicUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafePublicUrl("http://localhost:8080")).toBe(false);
    expect(isSafePublicUrl("https://10.1.2.3")).toBe(false);
  });

  it("rejects non-web schemes", () => {
    expect(isSafePublicUrl("file:///etc/passwd")).toBe(false);
    expect(isSafePublicUrl("gopher://x")).toBe(false);
  });

  it("assertSafePublicUrl returns the parsed URL when safe", () => {
    expect(assertSafePublicUrl("https://en.wikipedia.org/wiki/Test").hostname).toBe(
      "en.wikipedia.org"
    );
  });
});
