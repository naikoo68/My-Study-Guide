// Video branding — the header (logo + name) and the footer (website) drawn on
// every AI Slideshow / Reel / Short / long-video slide.
//
// Why a separate set of fields (videoBrand*) instead of siteName / logoUrl:
// a cross-posting user's videos go to THEIR channel, so they must carry THEIR
// name — but siteName / logoUrl / primaryColor are copied from the main account
// by "Copy everything", which is how every user's Shorts ended up saying
// "MyStudyGuide · www.mystudyguide.in". These fields are never copied (see
// socialProfileController NOT_COPIED), and a user who hasn't set them gets their
// own YouTube channel / profile name instead of ours.
//
// Pure (no DB) so it can be unit-tested.

const HEX = /^#[0-9a-f]{6}$/i;

// Only a hosted http(s) image: the URL is passed to the screenshot page as a
// query param (a base64 data: URI would be far too long) and loaded by <img>.
export function cleanBrandLogoUrl(v) {
  const u = String(v || "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(u) && u.length <= 1000 ? u : "";
}

// "https://www.example.com/" → "www.example.com" (what the footer shows).
export function cleanBrandWebsite(v) {
  return String(v || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").replace(/[<>"\s]/g, "").slice(0, 80);
}

export const cleanBrandName = (v) => String(v || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

// → { name, logoUrl, website, color, custom }
//   name     — "" means the built-in "MyStudyGuide" wordmark (main account only)
//   website  — footer text; "" hides the footer
//   custom   — true when anything differs from the built-in brand
// `siteUrl` = the main account's default footer (CLIENT_URL).
export function videoBrandFromSite(site, { siteUrl = "" } = {}) {
  const profile = !!site?.socialProfile;
  const color = HEX.test(String(site?.videoBrandColor || "")) ? String(site.videoBrandColor).toLowerCase()
    : (HEX.test(String(site?.primaryColor || "")) ? String(site.primaryColor).toLowerCase() : "#2563eb");
  const name = cleanBrandName(site?.videoBrandName)
    // A cross-posting user who hasn't typed a name → their own channel / profile name.
    || (profile ? cleanBrandName(site?.ytChannelTitle) || cleanBrandName(site?.profileName) : "");
  const logoUrl = cleanBrandLogoUrl(site?.videoBrandLogoUrl);
  const hasWebsite = typeof site?.videoBrandWebsite === "string" && site.videoBrandWebsite.trim() !== "";
  // Main account: our site URL by default. Cross-posting user: nothing unless
  // they set their own (never advertise our domain on someone else's channel).
  const website = hasWebsite ? cleanBrandWebsite(site.videoBrandWebsite) : (profile ? "" : cleanBrandWebsite(siteUrl || "www.mystudyguide.in"));
  return { name, logoUrl, website, color, custom: !!(name || logoUrl || hasWebsite || profile) };
}

// The generateSlideshow() options for this brand (siteName also feeds the
// intro / end slide tag and the SVG fallback slide).
export function slideshowBrandOpts(site, { siteUrl = "" } = {}) {
  const b = videoBrandFromSite(site, { siteUrl });
  return {
    brandColor: b.color,
    siteName: b.name || (site?.socialProfile ? "" : (site?.siteName || "My Study Guide")),
    siteUrl: b.website,
    brandName: b.name,
    brandLogoUrl: b.logoUrl,
  };
}
