// Global NoSQL-injection guard (defence-in-depth).
//
// MongoDB treats object keys that start with "$" as query OPERATORS and keys
// that contain "." as nested/dotted PATHS. If a JSON body like
//   { "email": { "$gt": "" } }
// reaches a query such as `User.findOne({ email })` unchanged, the filter turns
// into an operator query and can bypass intended logic (classic NoSQL
// injection). Individual controllers in this app already `String(...)`-cast
// their inputs, but that safety relies on every one of ~30 controllers never
// forgetting a cast. This middleware removes the risk centrally: it recursively
// strips any key beginning with "$" or containing "." from req.body, req.query
// and req.params, so no controller — present or future — can be tricked.
//
// Legitimate requests are unaffected: this app never uses "$"- or "."-prefixed
// field names in its request payloads. Only the dangerous keys are dropped; the
// rest of the object is left intact.

function scrub(value, depth) {
  // Guard against pathologically deep/cyclic payloads.
  if (depth > 20 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) scrub(item, depth + 1);
    return;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete value[key];
      continue;
    }
    scrub(value[key], depth + 1);
  }
}

export function sanitizeRequest(req, _res, next) {
  try {
    if (req.body && typeof req.body === "object") scrub(req.body, 0);
    // Express 4: req.query / req.params are plain, mutable parsed objects.
    if (req.query && typeof req.query === "object") scrub(req.query, 0);
    if (req.params && typeof req.params === "object") scrub(req.params, 0);
  } catch {
    /* never let sanitisation itself break a request */
  }
  next();
}

export default sanitizeRequest;
