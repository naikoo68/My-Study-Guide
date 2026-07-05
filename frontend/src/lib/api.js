// Tiny fetch wrapper around the backend REST API.
// - Reads the base URL from VITE_API_URL (falls back to localhost).
// - Attaches the stored JWT as a Bearer token.
// - Retries automatically while a sleeping free-tier server wakes up.
// - Parses JSON and throws a useful Error on non-2xx responses.

const BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:5000/api";

const TOKEN_KEY = "mpm-token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry on network failures and gateway errors (502/503/504) — these happen
// while a free-tier host (e.g. Render) is spinning the server back up.
const MAX_RETRIES = 3;
const RETRYABLE = [502, 503, 504];

async function request(path, { method = "GET", body, auth = true, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  let payload = body;

  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) {
    finalHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let lastNetworkError = false;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE_URL}${path}`, { method, headers: finalHeaders, body: payload });
    } catch {
      lastNetworkError = true;
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * (attempt + 1)); // 2s, 4s, 6s — give the server time to wake
        continue;
      }
      break;
    }

    // Gateway/cold-start errors → wait and retry
    if (RETRYABLE.includes(res.status) && attempt < MAX_RETRIES) {
      await sleep(2000 * (attempt + 1));
      continue;
    }

    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const message = data?.message || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  throw new Error(
    lastNetworkError
      ? "Cannot reach the server. It may be waking up from sleep — please wait a moment and try again."
      : "The server is starting up. Please try again in a few seconds."
  );
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  del: (path, opts) => request(path, { ...opts, method: "DELETE" }),
  baseUrl: BASE_URL,
};
