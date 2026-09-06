import { describe, it, expect, afterEach } from "vitest";
import {
  isEncrypted,
  encryptSecret,
  decryptSecret,
  keyFingerprint,
  hasEncSecret,
} from "../../src/utils/keyCrypto.js";

// These helpers read process.env.AI_KEY_ENC_SECRET lazily on every call, so we
// can toggle encryption on/off per test just by setting/clearing the env var.
const SECRET = "unit-test-super-secret-value";
afterEach(() => {
  delete process.env.AI_KEY_ENC_SECRET;
});

describe("hasEncSecret", () => {
  it("reflects whether a non-blank secret is configured", () => {
    delete process.env.AI_KEY_ENC_SECRET;
    expect(hasEncSecret()).toBe(false);
    process.env.AI_KEY_ENC_SECRET = "   ";
    expect(hasEncSecret()).toBe(false); // blank counts as unset
    process.env.AI_KEY_ENC_SECRET = SECRET;
    expect(hasEncSecret()).toBe(true);
  });
});

describe("with a secret configured (encryption ON)", () => {
  it("round-trips a secret through encrypt/decrypt", () => {
    process.env.AI_KEY_ENC_SECRET = SECRET;
    const plain = "sk-live-abc123";
    const enc = encryptSecret(plain);
    expect(enc).toMatch(/^enc:v1:/);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    process.env.AI_KEY_ENC_SECRET = SECRET;
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-value");
    expect(decryptSecret(b)).toBe("same-value");
  });

  it("returns '' when the secret cannot open the ciphertext (rotated key)", () => {
    process.env.AI_KEY_ENC_SECRET = SECRET;
    const enc = encryptSecret("value");
    process.env.AI_KEY_ENC_SECRET = "a-different-secret";
    expect(decryptSecret(enc)).toBe("");
  });

  it("keyFingerprint is deterministic and non-reversible (hex, HMAC)", () => {
    process.env.AI_KEY_ENC_SECRET = SECRET;
    const fp1 = keyFingerprint("sk-abc");
    const fp2 = keyFingerprint("  sk-abc  "); // trimmed before hashing
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
    expect(keyFingerprint("sk-different")).not.toBe(fp1);
  });
});

describe("without a secret (safe degradation, encryption OFF)", () => {
  it("stores and reads secrets as plaintext", () => {
    delete process.env.AI_KEY_ENC_SECRET;
    const plain = "sk-plain";
    const enc = encryptSecret(plain);
    expect(enc).toBe(plain); // unchanged
    expect(isEncrypted(enc)).toBe(false);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("returns '' for a value encrypted earlier but with no secret now", () => {
    process.env.AI_KEY_ENC_SECRET = SECRET;
    const enc = encryptSecret("value");
    delete process.env.AI_KEY_ENC_SECRET;
    expect(decryptSecret(enc)).toBe("");
  });

  it("keyFingerprint falls back to plain SHA-256 hex", () => {
    delete process.env.AI_KEY_ENC_SECRET;
    const fp = keyFingerprint("sk-abc");
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
    expect(keyFingerprint("sk-abc")).toBe(fp); // deterministic
  });
});

describe("isEncrypted", () => {
  it("only recognises the enc:v1: prefix on strings", () => {
    expect(isEncrypted("enc:v1:iv:tag:ct")).toBe(true);
    expect(isEncrypted("plain")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(12345)).toBe(false);
  });
});
