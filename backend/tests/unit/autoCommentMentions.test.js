import { describe, it, expect } from "vitest";
import { buildMentionSuffix } from "../../src/config/facebook.js";

// The Auto First Comment mention list is appended to every scheduled comment.
// Instagram parses `@handle` in a message body and renders it as a clickable
// mention when the account exists. Facebook is stricter: only Page tags with
// the bracketed `@[page-id]` form are clickable, so plain `@name` on Facebook
// would just show as visible text and not tag anything — we strip the leading
// "@" for Facebook to avoid that noise, and keep the bracketed tokens verbatim.

describe("buildMentionSuffix", () => {
  it("returns an empty string when there are no mentions", () => {
    expect(buildMentionSuffix([], "instagram")).toBe("");
    expect(buildMentionSuffix(undefined, "facebook")).toBe("");
    expect(buildMentionSuffix(["", "   "], "instagram")).toBe("");
  });

  it("formats a plain handle as @handle on Instagram", () => {
    const out = buildMentionSuffix(["mystudyguide_"], "instagram");
    expect(out).toBe("\n\n@mystudyguide_");
  });

  it("keeps an already @-prefixed handle intact on Instagram", () => {
    const out = buildMentionSuffix(["@mystudyguide_"], "instagram");
    expect(out).toBe("\n\n@mystudyguide_");
  });

  it("joins multiple handles with a single space on Instagram", () => {
    const out = buildMentionSuffix(["@one", "two"], "instagram");
    expect(out).toBe("\n\n@one @two");
  });

  it("strips the @ from a plain handle on Facebook (Facebook only tags Pages)", () => {
    // Plain `@handle` on Facebook is not clickable; leaving the @ in front
    // would look like a broken tag, so the Facebook form drops the leading @.
    const out = buildMentionSuffix(["@myfriend"], "facebook");
    expect(out).toBe("\n\nmyfriend");
  });

  it("keeps @[page-id] Page tags verbatim on Facebook", () => {
    // The bracketed form is the only mention style Facebook renders as
    // clickable in a comment message.
    const out = buildMentionSuffix(["@[123456789]"], "facebook");
    expect(out).toBe("\n\n@[123456789]");
  });

  it("keeps @[page-id] as a clickable IG-style mention on Instagram (strips brackets)", () => {
    // Instagram doesn't understand the FB bracket form, so unwrap it there so
    // the admin doesn't see literal `@[123]` text on the IG comment.
    const out = buildMentionSuffix(["@[123456789]"], "instagram");
    expect(out).toBe("\n\n@123456789");
  });

  it("dedupes case-insensitively", () => {
    const out = buildMentionSuffix(["@FooBar", "foobar", "@foobar"], "instagram");
    expect(out).toBe("\n\n@FooBar");
  });

  it("ignores whitespace-only tokens and empty strings", () => {
    const out = buildMentionSuffix(["", "   ", "@ok"], "instagram");
    expect(out).toBe("\n\n@ok");
  });

  it("returns a leading blank line so the mentions never join the comment text", () => {
    const out = buildMentionSuffix(["@ok"], "instagram");
    expect(out.startsWith("\n\n")).toBe(true);
  });
});
