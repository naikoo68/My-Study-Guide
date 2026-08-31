import crypto from "crypto";

// Central password policy so the same rules apply to admin bootstrap, user
// registration and CBT registration. A strong password is at least `min`
// characters and mixes letters and digits (basic complexity).
export function passwordProblem(pw, { min = 8 } = {}) {
  const s = String(pw || "");
  if (s.length < min) return `Password must be at least ${min} characters.`;
  if (!/[A-Za-z]/.test(s)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(s)) return "Password must contain at least one number.";
  // Reject a handful of obviously weak/known defaults regardless of length.
  if (/^(admin123|password|password1|12345678|changeme|admin@123)$/i.test(s.trim())) {
    return "Password is too common — choose a less predictable password.";
  }
  return "";
}

export function isStrongPassword(pw, opts) {
  return passwordProblem(pw, opts) === "";
}

// Generate a random, strong bootstrap password (used when no strong
// ADMIN_PASSWORD is provided, so a deployment never gets a KNOWN default).
export function generateStrongPassword(len = 20) {
  // URL-safe base64 → always contains letters+digits; trim to length.
  return "Aa1" + crypto.randomBytes(len).toString("base64url").slice(0, len);
}
