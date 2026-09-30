import { describe, it, expect } from "vitest";
import { formatSocialLinks, socialLinkList } from "../src/utils/socialLinks.js";
import { buildYtLongDescription, buildYtDescription } from "../src/config/youtube.js";

const links = [
  { platform: "instagram", url: "https://instagram.com/msg" },
  { platform: "youtube", url: "https://youtube.com/@msg" },
  { platform: "facebook", url: "https://facebook.com/msg" },
  { platform: "telegram", url: "https://t.me/msg" },
  { platform: "whatsapp", url: "" },
  { platform: "facebook", url: "https://facebook.com/msg" },
];

describe("social links", () => {
  it("cleans, dedupes and orders them (YouTube, Facebook, Instagram, Telegram…)", () => {
    expect(socialLinkList(links).map((l) => l.platform)).toEqual(["youtube", "facebook", "instagram", "telegram"]);
  });
  it("leaves out the platform being posted to, and adds the website", () => {
    const t = formatSocialLinks(links, { exclude: ["facebook"], siteUrl: "https://www.mystudyguide.in" });
    expect(t).toBe("📌 Follow us & practise more:\n▶️ YouTube: https://youtube.com/@msg\n📸 Instagram: https://instagram.com/msg\n✈️ Telegram: https://t.me/msg\n🌐 Website: https://www.mystudyguide.in");
    expect(formatSocialLinks([])).toBe("");
  });
  it("goes into the long-video description before the hashtags", () => {
    const d = buildYtLongDescription({ title: "T", intro: "25 questions.", hashtags: "#Economics", followLinks: formatSocialLinks(links, { exclude: ["youtube"] }) });
    expect(d.indexOf("Follow us")).toBeGreaterThan(d.indexOf("25 questions"));
    expect(d.indexOf("Follow us")).toBeLessThan(d.indexOf("#Economics"));
    expect(d).toContain("📘 Facebook: https://facebook.com/msg");
    expect(d).not.toContain("youtube.com/@msg");
  });
  it("and into a Short's description", () => {
    const d = buildYtDescription("Q1…", "📌 Follow us:\n📘 Facebook: https://facebook.com/msg");
    expect(d).toMatch(/Q1…\n\n📌 Follow us:\n📘 Facebook: https:\/\/facebook.com\/msg\n\n#Shorts$/);
  });
});
