import { isDev, isTest } from "../utils/env.js";

// 404 handler for unknown routes.
export function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Not found - ${req.originalUrl}`));
}

// Central error handler.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // If headers are already sent, delegate to Express's default error handler.
  if (res.headersSent) return next(err);

  // Prefer an explicit status set on the response; otherwise honour a status
  // carried on the error (e.g. body-parser's 413 "payload too large"), falling
  // back to 500. Without the err.status/statusCode check, a 413 from the JSON
  // body parser (which never sets res.statusCode) would surface as a generic 500.
  const status =
    (res.statusCode && res.statusCode !== 200 && res.statusCode) ||
    err.status ||
    err.statusCode ||
    500;

  // Log server errors for debugging (never log expected 4xx client errors).
  // Full stack is logged server-side in every non-test env — it is never sent
  // to the client except in explicit development (secure-by-default).
  if (status >= 500) {
    console.error(`[ERROR ${status}] ${req.method} ${req.originalUrl}:`, err.message);
    if (!isTest()) console.error(err.stack);
  }

  res.status(status).json({
    // Hide 5xx details and stack traces unless NODE_ENV is explicitly development.
    message: status >= 500 && !isDev()
      ? "An unexpected error occurred"
      : (err.message || "Server error"),
    stack: isDev() ? err.stack : undefined,
  });
}
