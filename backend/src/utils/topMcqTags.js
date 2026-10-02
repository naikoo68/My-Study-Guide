// "Top MCQs of <Subject>" / "Top MCQs of <Topic>" — added to every VIDEO:
// as YouTube tags (readable, with spaces) and as visible hashtags
// (#TopMCQsOfEconomics) on YouTube and Facebook. Pure (tested).
const clean = (s) => String(s || "").replace(/^[A-Z]\)\s*/, "").replace(/[<>,"#]/g, " ").replace(/\s+/g, " ").trim();

// → ["Top MCQs of Economics", "Top MCQs of Fiscal Policy of India"] (no blanks, no repeats).
export function topMcqTagNames({ subject = "", topic = "" } = {}) {
  const out = [];
  for (const n of [subject, topic].map(clean)) {
    if (!n) continue;
    const t = `Top MCQs of ${n}`.slice(0, 100);
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

// → "#TopMCQsOfEconomics #TopMCQsOfFiscalPolicyOfIndia"
export function topMcqHashtags(names = {}) {
  return topMcqTagNames(names)
    .map((t) => "#" + t.replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ").trim().split(/\s+/)
      .map((w) => (w === "MCQs" ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(""))
    .join(" ");
}
