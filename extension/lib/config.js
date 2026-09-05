// Companion configuration + secure token/base storage. NO AI keys or backend
// secrets are ever stored here — only the user's My Study Guide JWT and the API
// base URL. Change DEFAULT_API_BASE / DEFAULT_SITE to your own deployment, or
// set them from the popup's Settings.
export const DEFAULT_API_BASE = "https://api.mystudyguide.in/api";
export const DEFAULT_SITE = "https://www.mystudyguide.in";

export async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  return (apiBase || DEFAULT_API_BASE).replace(/\/$/, "");
}
export async function setApiBase(v) {
  await chrome.storage.local.set({ apiBase: String(v || "").trim().replace(/\/$/, "") });
}
export async function getSite() {
  const { site } = await chrome.storage.local.get("site");
  return (site || DEFAULT_SITE).replace(/\/$/, "");
}
export async function setSite(v) {
  await chrome.storage.local.set({ site: String(v || "").trim().replace(/\/$/, "") });
}
export async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || "";
}
export async function setToken(t) {
  await chrome.storage.local.set({ token: t });
}
export async function clearToken() {
  await chrome.storage.local.remove("token");
}
