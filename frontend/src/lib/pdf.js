// On-demand PDF text extraction in the browser.
//
// pdf.js is loaded from a CDN the first time a PDF is uploaded, so it never
// enters the app bundle and needs no build-time dependency (npm install here is
// blocked, and a lockfile mismatch would break `npm ci` in CI). The jsdelivr
// "@4" major range guarantees the library and its worker resolve to the same
// existing version.
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build";

let libPromise = null;
function loadPdfjs() {
  if (!libPromise) {
    // @vite-ignore keeps Vite from trying to bundle/resolve the CDN URL — it
    // stays a native runtime dynamic import in the browser.
    libPromise = import(/* @vite-ignore */ `${PDFJS}/pdf.min.mjs`).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
      return lib;
    });
  }
  return libPromise;
}

// Extract plain text from a PDF File/Blob. onProgress(page, totalPages) fires
// once per page so the caller can show progress. Returns the combined text
// (empty string for image-only / scanned PDFs that have no selectable text).
export async function extractPdfText(file, onProgress) {
  const lib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await lib.getDocument({ data }).promise;
  const pages = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => (it && "str" in it ? it.str : "")).join(" "));
      onProgress?.(i, pdf.numPages);
    }
  } finally {
    try { await pdf.cleanup(); } catch { /* ignore */ }
  }
  return pages
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
