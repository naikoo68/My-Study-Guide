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
export async function renderFlashcardCardShot(question) {
  if (!isCloudinaryConfigured()) return { error: "Cloudinary is not configured." };
  const id = question?._id;
  if (!id) return { error: "No question id." };
  const url = `${siteOrigin()}/flashcard/${id}`;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    // Wider viewport — the two panels sit side by side (~968px of content).
    await page.setViewport({ width: 1040, height: 1200, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 25000 });
    await page.waitForSelector('[data-card-ready="1"]', { timeout: 20000 });
    const el = await page.$("[data-card-el]");
    if (!el) throw new Error("Flashcard element not found.");
    const buf = await el.screenshot({ type: "png" });
    await browser.close();
    browser = null;

    const dataUri = `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
    const { url: hosted } = await uploadImage(dataUri, { format: "png", folder: "mystudyguide/social" });
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
    const buf = await el.screenshot({ type: "png" });
    await browser.close();
    browser = null;

    const dataUri = `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
    const { url: hosted } = await uploadImage(dataUri, { format: "png", folder: "mystudyguide/social" });
    if (hosted) return { url: hosted };
    return { error: "Cloudinary returned no URL." };
  } catch (err) {
    return { error: `Card screenshot failed: ${err?.message || err}` };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
}
