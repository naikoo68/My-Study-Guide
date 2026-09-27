// Render a question card to a hosted PNG that is PIXEL-IDENTICAL to the on-screen
// quiz card — by loading the REAL /q-card/<id> page in a headless browser and
// screenshotting it (same React, Tailwind and Inter font students see), then
// uploading to Cloudinary. Returns { url } on success or { error }.
//
// Callers MUST treat this as best-effort and fall back to the lightweight SVG
// card (config/socialImage.js) on any error, so a Facebook/Instagram post can
// never be blocked by a browser/render hiccup. puppeteer-core uses the system
// Chromium installed in the Docker image (see backend/Dockerfile); if Chromium
// isn't present (e.g. local dev), the dynamic import / launch simply fails and
// the caller falls back.
import { uploadImage, isCloudinaryConfigured } from "./cloudinary.js";

// Public site origin where the /q-card SPA route is served.
function siteOrigin() {
  return String(process.env.CLIENT_URL || "https://www.mystudyguide.in").replace(/\/+$/, "");
}

let _puppeteer = null;
async function getPuppeteer() {
  if (!_puppeteer) _puppeteer = (await import("puppeteer-core")).default;
  return _puppeteer;
}

// Candidate Chromium locations (env first, then the usual Alpine/Debian paths).
const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/lib/chromium/chromium",
].filter(Boolean);

async function launchBrowser() {
  const puppeteer = await getPuppeteer();
  let lastErr;
  for (const executablePath of CHROME_PATHS) {
    try {
      return await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage", // avoid /dev/shm crashes in containers
          "--disable-gpu",
          "--hide-scrollbars",
        ],
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No Chromium executable found.");
}

// Screenshot the TWO-PANEL flashcard page (/flashcard/:id) — question on the
// left, answer (correct option + explanation + key points + quick recall) on the
// right — and upload it as a single combined image. Best-effort: any failure
// returns { error } and the caller falls back to the normal card.
export async function renderFlashcardCardShot(question, { templateUrl = "" } = {}) {
  if (!isCloudinaryConfigured()) return { error: "Cloudinary is not configured." };
  const id = question?._id;
  if (!id) return { error: "No question id." };
  // When a custom template image is configured, the /flashcard page renders in
  // "template overlay" mode: the uploaded image is the background and the quiz
  // content is placed into its boxes.
  const tpl = String(templateUrl || "").trim();
  const url = `${siteOrigin()}/flashcard/${id}${tpl ? `?tpl=${encodeURIComponent(tpl)}` : ""}`;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    // Wide enough for the 1536-px flashcard canvas (built-in design is narrower,
    // still fine). deviceScaleFactor 2 keeps the text crisp.
    await page.setViewport({ width: 1600, height: 1120, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 25000 });
    await page.waitForSelector('[data-card-ready="1"]', { timeout: 20000 });
    const el = await page.$("[data-card-el]");
    if (!el) throw new Error("Flashcard element not found.");
    // Upload as JPEG, not PNG. Instagram's Content Publishing API only reliably
    // accepts JPEG (a PNG source with an `f_jpg` transform prepended by
    // toInstagramSafeUrl otherwise makes Cloudinary re-transcode on-the-fly
    // every first fetch — occasionally slow enough for Meta's downloader to
    // give up with "Only photo or video can be accepted as media type."
    // subcode 2207052 = media_download_error). A native JPEG source removes
    // that on-demand format conversion entirely.
    const buf = await el.screenshot({ type: "jpeg", quality: 92 });
    await browser.close();
    browser = null;

    const dataUri = `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`;
    const { url: hosted } = await uploadImage(dataUri, { format: "jpg", folder: "mystudyguide/social" });
    if (hosted) return { url: hosted };
    return { error: "Cloudinary returned no URL." };
  } catch (err) {
    return { error: `Flashcard screenshot failed: ${err?.message || err}` };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
}

// Screenshot /q-card/:id and upload it. `includeAnswer` highlights the correct
// option (mirrors a schedule's Reveal-answer toggle).
export async function renderQuestionCardShot(question, { includeAnswer = false, cta = false, watermark = null, textWatermark = null } = {}) {
  if (!isCloudinaryConfigured()) return { error: "Cloudinary is not configured." };
  const id = question?._id;
  if (!id) return { error: "No question id." };
  // Build /q-card query: answer highlight, the "Comment your answer!" CTA, the
  // selfie/logo watermark overlay, and the center text watermark — so the
  // screenshot bakes them all in.
  const p = new URLSearchParams();
  if (includeAnswer) p.set("answer", "1");
  if (cta) p.set("cta", "1");
  if (watermark && watermark.url) {
    p.set("wm", watermark.url);
    if (watermark.size) p.set("wmsize", String(watermark.size));
    if (watermark.opacity) p.set("wmop", String(watermark.opacity));
    if (watermark.position) p.set("wmpos", watermark.position);
    if (watermark.shape) p.set("wmshape", watermark.shape);
  }
  if (textWatermark && textWatermark.text) {
    p.set("wmt", textWatermark.text);
    if (textWatermark.size) p.set("wmtsize", String(textWatermark.size));
    if (textWatermark.opacity) p.set("wmtop", String(textWatermark.opacity));
  }
  const qs = p.toString();
  const url = `${siteOrigin()}/q-card/${id}${qs ? `?${qs}` : ""}`;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1040, height: 1400, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 25000 });
    // Wait for the card to signal it has fully rendered (question + web fonts).
    await page.waitForSelector('[data-card-ready="1"]', { timeout: 20000 });
    const el = await page.$("[data-card-el]");
    if (!el) throw new Error("Card element not found.");
    // Upload as JPEG (not PNG). See renderFlashcardCardShot above for the full
    // reason: it lets Instagram fetch the delivered URL directly without asking
    // Cloudinary to re-transcode a PNG on the fly via `f_jpg`.
    const buf = await el.screenshot({ type: "jpeg", quality: 92 });
    await browser.close();
    browser = null;

    const dataUri = `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`;
    const { url: hosted } = await uploadImage(dataUri, { format: "jpg", folder: "mystudyguide/social" });
    if (hosted) return { url: hosted };
    return { error: "Cloudinary returned no URL." };
  } catch (err) {
    return { error: `Card screenshot failed: ${err?.message || err}` };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
}


// Screenshot the 9:16 AI Slideshow slides from /slide-card/:id (the SAME quiz
// components + Inter font students see) straight to local PNG files for ffmpeg.
//   items: [{ questionId, role, tag, caption, template, templateSize?: { width, height }, outPath }]
//   opts:  { siteUrl }
// Uses ONE browser for all slides. Returns an array (same order) of
// { ok: true } or { error } per slide — callers fall back to the SVG slide for
// any that failed. If the first slide fails (e.g. the frontend with the
// /slide-card route isn't deployed yet), the rest are skipped immediately
// instead of each waiting for a timeout.
export async function renderSlideCardShots(items = [], { siteUrl = "" } = {}) {
  const results = items.map(() => ({ error: "not rendered" }));
  if (!items.length) return results;
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    // The site is a PWA: after the first slide its service worker would serve
    // later navigations/API calls (stale cache, stuck "Loading…"). Every slide
    // must load fresh, so bypass it.
    await page.setBypassServiceWorker(true).catch(() => {});
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        if (!it?.questionId) throw new Error("No question id.");
        const p = new URLSearchParams();
        p.set("role", it.role === "answer" ? "answer" : "question");
        if (it.tag) p.set("tag", String(it.tag));
        if (it.caption) p.set("cap", String(it.caption).slice(0, 600));
        if (it.template) p.set("tpl", "1");
        if (it.template && it.templateSize?.width > 0 && it.templateSize?.height > 0) {
          p.set("tw", String(it.templateSize.width));
          p.set("th", String(it.templateSize.height));
        }
        if (siteUrl) p.set("site", siteUrl);
        await page.goto(`${siteOrigin()}/slide-card/${it.questionId}?${p}`, { waitUntil: "networkidle0", timeout: 25000 });
        await page.waitForSelector('[data-card-ready="1"]', { timeout: 15000 });
        // Question / explanation figures must be loaded before the capture.
        await page.waitForFunction(() => Array.from(document.images).every((im) => im.complete), { timeout: 8000 }).catch(() => {});
        const el = await page.$("[data-card-el]");
        if (!el) throw new Error("Slide element not found.");
        // PNG with a transparent page in template mode, so the template
        // (composited underneath by ffmpeg) shows around the card.
        await el.screenshot({ path: it.outPath, type: "png", omitBackground: !!it.template });
        results[i] = { ok: true };
      } catch (err) {
        results[i] = { error: `Slide screenshot failed: ${err?.message || err}` };
        if (i === 0) break;
      }
    }
  } catch (err) {
    const msg = `Slide screenshot failed: ${err?.message || err}`;
    for (let i = 0; i < results.length; i++) if (!results[i].ok) results[i] = { error: msg };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
  return results;
}
