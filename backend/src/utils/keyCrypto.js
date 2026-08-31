import crypto from "crypto";

// Encryption-at-rest for AI provider secrets (AiKey.key). Uses AES-256-GCM with
// a key derived from the env secret AI_KEY_ENC_SECRET. Ciphertext is tagged with
// a version prefix so legacy plaintext rows can be detected and migrated.
//
// SAFE DEGRADATION: if AI_KEY_ENC_SECRET is NOT set, encryption is simply turned
// off — keys are stored/read as plaintext (exactly like before this feature) and
// the app keeps working. A missing secret can therefore never break saving keys
// or take the site down; it just means keys aren't encrypted until the secret is
// configured (a startup warning reminds the operator).
const PREFIX = "enc:v1:";

const rawSecret = () => process.env.AI_KEY_ENC_SECRET;
export function hasEncSecret() {
  return !!(rawSecret() && String(rawSecret()).trim());
}
// 32-byte AES key derived from the env secret. Only called when hasEncSecret().
function encKey() {
  return crypto.createHash("sha256").update(String(rawSecret())).digest();
}

// True if a stored value is one of our AES-256-GCM ciphertexts (not legacy plain).
export function isEncrypted(v) {
  return typeof v === "string" && v.startsWith(PREFIX);
}

// Encrypt a secret → "enc:v1:<iv b64>:<tag b64>:<ciphertext b64>".
// With no secret configured, returns the plaintext unchanged (encryption off).
export function encryptSecret(plain) {
  if (!hasEncSecret()) return String(plain); // no secret → store as-is (unencrypted)
  const iv = crypto.randomBytes(12); // 96-bit nonce recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

// Decrypt a stored value. Legacy plaintext is returned unchanged. An encrypted
// value with no/rotated secret is returned as "" (skipped) rather than crashing.
export function decryptSecret(stored) {
  const v = String(stored || "");
  if (!isEncrypted(v)) return v; // legacy/plaintext row — nothing to decrypt
  if (!hasEncSecret()) return ""; // encrypted but no secret to open it — skip safely
  try {
    const parts = v.split(":"); // ["enc","v1",iv,tag,ct]
    const iv = Buffer.from(parts[2], "base64");
    const tag = Buffer.from(parts[3], "base64");
    const ct = Buffer.from(parts[4], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return ""; // wrong/rotated secret — skip this key rather than crash the app
  }
}

// Deterministic, non-reversible fingerprint for usage-counter / dedupe lookups.
// HMAC-SHA256 when a secret is set; plain SHA-256 fallback when it isn't (so
// lookups still work without a secret).
export function keyFingerprint(plain) {
  const p = String(plain || "").trim();
  return hasEncSecret()
    ? crypto.createHmac("sha256", encKey()).update(p).digest("hex")
    : crypto.createHash("sha256").update(p).digest("hex");
}
