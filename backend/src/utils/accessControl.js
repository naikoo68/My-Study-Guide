// Shared logic for resolving whether a user may access a test series.
// A test may be visible to everyone (visibleToAll) unless an explicit per-user
// entry overrides it. An entry can hide the test (visible:false) or grant
// time-limited access (validUntil in the past = expired = hidden).

export function findAccessEntry(test, userId) {
  if (!userId) return null;
  return (test.access || []).find((a) => String(a.user) === String(userId)) || null;
}

export function isTestVisibleToUser(test, userId) {
  const entry = findAccessEntry(test, userId);
  if (entry) {
    if (!entry.visible) return false;
    if (entry.validUntil && new Date(entry.validUntil).getTime() < Date.now()) return false;
    return true;
  }
  // No explicit entry: hidden by default unless the test is marked public.
  return test.visibleToAll === true;
}
