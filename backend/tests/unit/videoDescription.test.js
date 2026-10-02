import { describe, it, expect } from "vitest";
import { customVideoText, withVideoText, cleanVideoText } from "../../src/utils/videoDescription.js";

describe("text for every video description", () => {
  const site = { videoDescriptionText: "📲 Join our Telegram: t.me/mystudyguide", videoDescriptionYoutube: true, videoDescriptionFacebook: true };

  it("is used on each platform unless switched off there", () => {
    expect(customVideoText(site, "youtube")).toBe(site.videoDescriptionText);
    expect(customVideoText(site, "facebook")).toBe(site.videoDescriptionText);
    expect(customVideoText({ ...site, videoDescriptionFacebook: false }, "facebook")).toBe("");
    expect(customVideoText({ ...site, videoDescriptionYoutube: false }, "youtube")).toBe("");
    expect(customVideoText({}, "youtube")).toBe("");
    expect(customVideoText({ videoDescriptionText: "Hi" }, "facebook")).toBe("Hi"); // on by default
  });

  it("goes above a final hashtags line, else at the end", () => {
    expect(withVideoText("Title\n\nChapters:\n0:00 Q1\n\n#JKSSB #Quiz", "Join us")).toBe("Title\n\nChapters:\n0:00 Q1\n\nJoin us\n\n#JKSSB #Quiz");
    expect(withVideoText("Title\n\nWatch the full video", "Join us")).toBe("Title\n\nWatch the full video\n\nJoin us");
    expect(withVideoText("", "Join us")).toBe("Join us");
    expect(withVideoText("Title", "")).toBe("Title");
    expect(withVideoText("Title\n\nJoin us", "Join us")).toBe("Title\n\nJoin us"); // not twice
  });

  it("keeps the admin's text and hashtags when the description is too long", () => {
    const out = withVideoText(`${"x".repeat(300)}\n\n#Tag`, "Join us", 120);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(120);
    expect(out.endsWith("Join us\n\n#Tag")).toBe(true);
  });

  it("cleans the saved text", () => {
    expect(cleanVideoText("  a<b>\r\n\n\n\nc  ")).toBe("ab\n\nc");
    expect(cleanVideoText("y".repeat(2000))).toHaveLength(1500);
  });
});
