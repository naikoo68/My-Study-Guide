import rateLimit from "express-rate-limit";

// Rate-limit abstraction for auth/verification endpoints. The COUNTER STORE is
// kept behind createStore() so it can be swapped for a shared store (e.g. Redis)
// later — for a multi-instance deploy — without touching any call site. Today it
// uses express-rate-limit's in-process MemoryStore (store: undefined).
function createStore() {
  return undefined; // in-memory (single instance) — swap to a Redis store here later
}

// Per-account identifier taken from the request body (email/phone), lower-cased.
const acctOf = (req) => String(req.body?.email || req.body?.phone || "").toLowerCase().trim();
const ipOf = (req) => req.ip || req.socket?.remoteAddress || "unknown";

// Build a limiter. `by`:
//   "ip"          — throttle each client IP
//   "account"     — throttle each account (across IPs); falls back to IP when the
//                   body has no email/phone, so anonymous callers are still capped
//   "ip+account"  — throttle each (IP, account) pair
// We supply our own key, so express-rate-limit's IPv6/proxy key validation is
// disabled (validate:false) to stay robust across library versions.
export function makeLimiter({ windowMs, max, name = "rl", by = "ip+account" }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore(),
    validate: false,
    keyGenerator: (req) => {
      const ip = ipOf(req);
      if (by === "ip") return `${name}:ip:${ip}`;
      const acct = acctOf(req);
      if (by === "account") return `${name}:acct:${acct || ip}`;
      return `${name}:${ip}:${acct}`;
    },
    message: { message: "Too many attempts. Please wait a few minutes and try again." },
  });
}

// Preconfigured limiters for the sensitive auth/verification routes. Login and
// OTP verification are throttled BOTH per (IP+account) and per account across
// IPs (stack both on a route) to blunt single-IP and distributed attacks; the
// per-code attempt cap in the controllers is the definitive stop for 6-digit
// codes. Windows are generous enough for real users but far below brute-force.
export const loginLimiter = makeLimiter({ name: "login", windowMs: 15 * 60 * 1000, max: 10, by: "ip+account" });
export const loginAccountLimiter = makeLimiter({ name: "login-acct", windowMs: 15 * 60 * 1000, max: 20, by: "account" });
export const otpLimiter = makeLimiter({ name: "otp", windowMs: 15 * 60 * 1000, max: 12, by: "ip+account" });
export const otpAccountLimiter = makeLimiter({ name: "otp-acct", windowMs: 15 * 60 * 1000, max: 20, by: "account" });
export const forgotLimiter = makeLimiter({ name: "forgot", windowMs: 60 * 60 * 1000, max: 8, by: "ip+account" });
export const registerLimiter = makeLimiter({ name: "register", windowMs: 60 * 60 * 1000, max: 20, by: "ip" });
