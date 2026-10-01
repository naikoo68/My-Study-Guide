import { describe, it, expect } from "vitest";
import { videoBrandFromSite, slideshowBrandOpts, cleanBrandLogoUrl, cleanBrandWebsite } from "../../src/utils/videoBrand.js";

describe("videoBrandFromSite", () => {
  it("main account with nothing set → built-in wordmark + our site", () => {
    const b = videoBrandFromSite({ siteName: "My Study Guide" }, { siteUrl: "https://www.mystudyguide.in/" });
    expect(b.name).toBe("");
    expect(b.website).toBe("www.mystudyguide.in");
  });

  it("cross-posting user never inherits our name or domain", () => {
    const b = videoBrandFromSite({ socialProfile: true, siteName: "My Study Guide", ytChannelTitle: "Aadil Classes", profileName: "Aadil" }, { siteUrl: "https://www.mystudyguide.in" });
    expect(b.name).toBe("Aadil Classes");
    expect(b.website).toBe("");
  });

  it("falls back to the profile name when no channel is connected", () => {
    expect(videoBrandFromSite({ socialProfile: true, profileName: "Aadil" }).name).toBe("Aadil");
  });

  it("uses the saved brand fields first", () => {
    const b = videoBrandFromSite({ socialProfile: true, ytChannelTitle: "X", videoBrandName: "Daily MCQ", videoBrandWebsite: "https://dailymcq.in/", videoBrandLogoUrl: "https://res.cloudinary.com/a/logo.png", videoBrandColor: "#FF0000" });
    expect(b).toMatchObject({ name: "Daily MCQ", website: "dailymcq.in", logoUrl: "https://res.cloudinary.com/a/logo.png", color: "#ff0000" });
  });

  it("slideshow options keep an empty website (no fallback to ours)", () => {
    const o = slideshowBrandOpts({ socialProfile: true, profileName: "Aadil" }, { siteUrl: "https://www.mystudyguide.in" });
    expect(o.siteUrl).toBe("");
    expect(o.siteName).toBe("Aadil");
    expect(o.brandName).toBe("Aadil");
  });
});

describe("cleaners", () => {
  it("logo must be a hosted https URL (no data: / javascript:)", () => {
    expect(cleanBrandLogoUrl("data:image/png;base64,AAA")).toBe("");
    expect(cleanBrandLogoUrl("javascript:alert(1)")).toBe("");
    expect(cleanBrandLogoUrl("http://x.com/a.png")).toBe("");
    expect(cleanBrandLogoUrl("https://x.com/a.png")).toBe("https://x.com/a.png");
  });
  it("website strips scheme, slash and unsafe chars", () => {
    expect(cleanBrandWebsite(" https://site.in/<b> ")).toBe("site.in/b");
  });
});
