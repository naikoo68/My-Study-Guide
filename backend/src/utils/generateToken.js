import jwt from "jsonwebtoken";

// Signs a login token. We embed the user's current `tokenVersion` as the `tv`
// claim; the auth middleware compares it against the value stored on the user
// record and rejects the token if they differ. Bumping a user's tokenVersion
// (on logout, password reset/change, or when an account is blocked) therefore
// instantly invalidates every token issued before the bump — giving us server-
// side revocation while keeping tokens stateless.
//
// Default lifetime is 4 days: a sensible balance for a daily-use study app now
// that tokens are revocable. Override per-environment with JWT_EXPIRES_IN
// (e.g. "7d", "12h") without a code change.
export default function generateToken(userId, tokenVersion = 0) {
  return jwt.sign({ id: userId, tv: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "4d",
  });
}
