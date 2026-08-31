// Secure-by-default environment mode. The app is treated as PRODUCTION unless
// NODE_ENV is EXPLICITLY "development" — so a missing or misspelled NODE_ENV can
// never accidentally enable dev-only behaviour (devOtp exposure, stack traces in
// responses, or the legacy "trust raw profile" login path).
export const isDev = () => process.env.NODE_ENV === "development";
export const isTest = () => process.env.NODE_ENV === "test";
export const isProd = () => !isDev() && !isTest();

// Assert a sane NODE_ENV at boot. Warns (never crashes) on an unrecognised value
// so operators notice, while still defaulting to secure production behaviour.
export function assertNodeEnv() {
  const v = process.env.NODE_ENV;
  if (!v) {
    console.warn("⚠ NODE_ENV is not set — treating the app as PRODUCTION (secure default).");
  } else if (!["development", "production", "test"].includes(v)) {
    console.warn(`⚠ NODE_ENV="${v}" is not recognised — treating the app as PRODUCTION (secure default).`);
  }
}
