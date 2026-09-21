// Pick which saved auto-comment(s) to post under a scheduled Facebook/Instagram
// post, given the admin's GLOBAL comment list, the chosen mode, and the current
// rotation pointer. Pure & deterministic (except "random") so it's unit-tested
// without any network. The auto-poster stores `nextIndex` back on Settings so
// "rotate" advances one comment per post across the whole site.
//
// Modes:
//   "rotate" (default) — one comment per post, cycling through the list in order
//   "all"              — post every saved comment on each post
//   "random"           — one random comment per post
//
// Returns { comments: string[], nextIndex: number }.
export function selectAutoComments(list, mode = "rotate", index = 0, rng = Math.random) {
  const clean = (Array.isArray(list) ? list : [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);

  const cur = Number.isFinite(index) ? Math.trunc(index) : 0;
  if (clean.length === 0) return { comments: [], nextIndex: cur };

  if (mode === "all") {
    return { comments: clean, nextIndex: cur }; // pointer unchanged
  }

  if (mode === "random") {
    const i = Math.floor((typeof rng === "function" ? rng() : Math.random()) * clean.length);
    const safe = Math.min(clean.length - 1, Math.max(0, i));
    return { comments: [clean[safe]], nextIndex: cur }; // pointer unchanged
  }

  // "rotate" (default): use the pointer (wrapped, handles negatives) and advance.
  const i = ((cur % clean.length) + clean.length) % clean.length;
  return { comments: [clean[i]], nextIndex: cur + 1 };
}
