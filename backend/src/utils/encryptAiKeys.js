import AiKey from "../models/AiKey.js";
import { isEncrypted, encryptSecret, decryptSecret, keyFingerprint } from "./keyCrypto.js";

// One-time, idempotent migration: encrypt any plaintext AiKey.key at rest with
// AES-256-GCM and backfill its deterministic keyHash. Rows already encrypted AND
// hashed are skipped, so it's safe to run on every boot. Requires
// AI_KEY_ENC_SECRET (the crypto helpers throw without it).
export async function encryptAiKeys() {
  const rows = await AiKey.find({}).lean();
  let migrated = 0;
  for (const r of rows) {
    const enc = isEncrypted(r.key);
    const hasHash = !!r.keyHash;
    if (enc && hasHash) continue; // already migrated
    // Recover the plaintext: decrypt if it's already ciphertext, else it's the
    // legacy plaintext value we're about to encrypt.
    const plain = enc ? decryptSecret(r.key) : String(r.key || "");
    const patch = {};
    if (!enc) patch.key = encryptSecret(plain); // encrypt legacy plaintext at rest
    if (!hasHash) patch.keyHash = keyFingerprint(plain); // backfill lookup fingerprint
    await AiKey.updateOne({ _id: r._id }, { $set: patch });
    migrated += 1;
  }
  return { migrated };
}
