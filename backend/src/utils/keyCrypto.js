import crypto from "crypto";

// Encryption-at-rest for AI provider secrets (AiKey.key). Uses AES-256-GCM with
// a key derived from the env secret AI_KEY_ENC_SECRET. Ciphertext is tagged with
// a version prefix so legacy plaintext rows can be detected and migrated.
const PREFIX = "enc:v1:";

// Derive a stable 32-byte AES key from the (any-length) env secret. Throws when
// the secret is missing so callers fail loudly instead of storing plaintext.
function encKey() {
  const secret = process.env.AI_KEY_ENC_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error("AI_KEY_ENC_SECRET is not set — cannot encrypt/decrypt AI keys.");
  }
  return crypto.createHash("sha256").update(String(secret)).digest();
}

// True if a stored value is one of our AES-256-GCM ciphertexts (not legacy plain).
export function isEncrypted(v) {
  return typeof v === "string" && v.startsWith(PREFIX);
}

// Encrypt a secret → "enc:v1:<iv b64>:<tag b64>:<ciphertext b64>".
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12); // 96-bit nonce recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

// Decrypt a stored value. Legacy plaintext (not in our format) is returned
// unchanged so the app keeps working during/after the one-time migration.
export function decryptSecret(stored) {
  const v = String(stored || "");
  if (!isEncrypted(v)) return v; // legacy/plaintext row — nothing to decrypt
  const parts = v.split(":"); // ["enc","v1",iv,tag,ct]
  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const ct = Buffer.from(parts[4], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Deterministic, non-reversible fingerprint (HMAC-SHA256) of a plaintext key.
// Stored alongside the ciphertext so usage counters / dedupe can look a key up
// without ever querying by the plaintext or the (random-IV) ciphertext.
export function keyFingerprint(plain) {
  return crypto.createHmac("sha256", encKey()).update(String(plain || "").trim()).digest("hex");
}
