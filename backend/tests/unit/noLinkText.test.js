import { describe, it, expect } from "vitest";
import { toNoLinkText, stripNotifyAll, isNotifyAllOnly, forNoLinkComment, DEFAULT_LINK_IN_BIO } from "../../src/utils/noLinkText.js";

describe("no-link text (Instagram / YouTube Shorts)", () => {
  it("shortens URLs to a bare domain and adds the CTA once", () => {
    const t = toNoLinkText("Support us!\nExplore: https://www.mystudyguide.in/ and https://t.me/msg.");
    expect(t).toBe(`Support us!\nExplore: mystudyguide.in and t.me/msg.\n${DEFAULT_LINK_IN_BIO}`);
  });

  it("drops share tracking codes and stops @handles in links becoming Instagram mentions", () => {
    const t = toNoLinkText("▶️ YouTube: https://youtube.com/@mystudyguide786?si=oHqPl5jJOgj6vtYc\n📘 Facebook: https://facebook.com/share/1FsxpPXUcs/?mibextid=wwXIfr\n▶ https://www.youtube.com/watch?v=abc&si=x&t=30", { cta: "" });
    expect(t).toBe("▶️ YouTube: youtube.com/@\u200Bmystudyguide786\n📘 Facebook: facebook.com/share/1FsxpPXUcs\n▶ youtube.com/watch?v=abc&t=30");
    expect(t).not.toMatch(/@mystudyguide786/); // Instagram would link this to an Instagram account
  });

  it("leaves text without links untouched", () => {
    expect(toNoLinkText("Link in bio 🔗")).toBe("Link in bio 🔗");
    expect(toNoLinkText("Practice daily #GK")).toBe("Practice daily #GK");
  });

  it("puts the CTA before a trailing hashtag block, and skips it if already present or blank", () => {
    expect(toNoLinkText("Quiz\n\nMore: https://mystudyguide.in\n\n#GK #JKSSB")).toBe("Quiz\n\nMore: mystudyguide.in\n\n🔗 Link in bio\n\n#GK #JKSSB");
    expect(toNoLinkText("See https://x.com/a — link in our bio")).toBe("See x.com/a — link in our bio");
    expect(toNoLinkText("See https://x.com/a", { cta: "" })).toBe("See x.com/a");
  });

  it("drops @everyone/@followers but keeps real mentions", () => {
    expect(stripNotifyAll("Follow @mystudyguide_ @everyone @followers!")).toBe("Follow @mystudyguide_!");
    expect(isNotifyAllOnly("@followers")).toBe(true);
    expect(isNotifyAllOnly(" @everyone @all ")).toBe(true);
    expect(isNotifyAllOnly("@mystudyguide_")).toBe(false);
    expect(forNoLinkComment("@everyone")).toBe("");
  });
});
