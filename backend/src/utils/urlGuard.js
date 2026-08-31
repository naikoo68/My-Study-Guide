import net from "net";

// SSRF guard for outbound AI-provider base URLs. A client-controlled baseUrl
// must be https and must NOT point at internal/loopback/link-local/metadata
// addresses, so the server can't be tricked into fetching cloud metadata
// (169.254.169.254) or internal services. An optional strict allowlist limits
// requests to known provider hosts.

// Known public provider hosts. Extend with AI_PROVIDER_HOST_ALLOWLIST (comma).
const DEFAULT_HOSTS = [
  "generativelanguage.googleapis.com",
  "api.openai.com",
  "api.anthropic.com",
  "openrouter.ai",
  "api.groq.com",
  "api.deepseek.com",
  "api.mistral.ai",
  "api.together.xyz",
  "api.cohere.ai",
  "api.perplexity.ai",
  "api.tokenlab.sh",
];

function envAllowlist() {
  return String(process.env.AI_PROVIDER_HOST_ALLOWLIST || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
// When AI_PROVIDER_HOST_STRICT=true, ONLY hosts in (default + env) allowlist pass.
function strictMode() {
  return String(process.env.AI_PROVIDER_HOST_STRICT || "").toLowerCase() === "true";
}

// True when an IP literal falls in a private/loopback/link-local/metadata range.
function ipBlocked(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127) return true;                       // 127.0.0.0/8 loopback
    if (a === 10) return true;                         // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true;           // 169.254.0.0/16 link-local + cloud metadata
    if (a === 0) return true;                          // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true;                         // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::") return true;        // loopback / unspecified
    if (s.startsWith("fe80")) return true;             // link-local
    if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local
    if (s.startsWith("::ffff:")) return true;          // IPv4-mapped IPv6 (any) — never a real provider
    return false;
  }
  return false;
}

// Throws when the base URL is unsafe; returns the parsed URL when safe.
export function assertSafeProviderUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new Error("Invalid provider base URL."); }
  if (u.protocol !== "https:") throw new Error("Provider base URL must use https://.");
  const host = u.hostname.toLowerCase();
  // Block localhost and internal-only TLDs outright.
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Provider base URL points to an internal/loopback host.");
  }
  // Block IP-literal hosts in private/loopback/link-local/metadata ranges.
  const bare = host.startsWith("[") ? host.slice(1, -1) : host;
  if (net.isIP(bare) && ipBlocked(bare)) {
    throw new Error("Provider base URL points to a private/loopback/metadata address.");
  }
  // Optional strict allowlist (defense-in-depth for hostname-based SSRF/rebinding).
  if (strictMode()) {
    const allow = [...DEFAULT_HOSTS, ...envAllowlist()];
    const ok = allow.some((h) => host === h || host.endsWith("." + h));
    if (!ok) throw new Error("Provider host is not in the allowed list.");
  }
  return u;
}

export function isSafeProviderUrl(raw) {
  try { assertSafeProviderUrl(raw); return true; } catch { return false; }
}

// SSRF guard for USER-SUPPLIED web-page URLs (the "Import from Web" feature,
// where the server fetches an arbitrary page/video the user names). Unlike a
// provider base URL this may be http OR https (public article sites), but it
// must still never point at an internal/loopback/link-local/metadata address —
// otherwise a user could make the server fetch http://169.254.169.254/… (cloud
// metadata) or an internal service. Re-run this on every redirect hop too, so a
// public URL can't 30x-redirect into an internal one.
export function assertSafePublicUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new Error("Invalid URL."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("URL must use http:// or https://.");
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("URL points to an internal/loopback host.");
  }
  const bare = host.startsWith("[") ? host.slice(1, -1) : host;
  if (net.isIP(bare) && ipBlocked(bare)) {
    throw new Error("URL points to a private/loopback/metadata address.");
  }
  return u;
}

export function isSafePublicUrl(raw) {
  try { assertSafePublicUrl(raw); return true; } catch { return false; }
}
