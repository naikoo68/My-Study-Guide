// Build step: package the browser extension (../extension) into
// public/companion-extension.zip so the website can offer it as a direct
// download.
//
// The zip is a GENERATED build artifact (gitignored) — the source of truth is
// the extension/ directory. It is rebuilt on every `npm run build` via the
// "prebuild" script, so the downloadable file always matches the committed
// extension source. It is intentionally NOT committed: a binary archive is an
// unscannable blob (it hid the extension from code/secret scanners and was a
// redundant duplicate of extension/).
//
// Failures here are NON-FATAL (exit 0) so a packaging hiccup can never break the
// site deploy — worst case the download simply isn't refreshed.
import AdmZip from "adm-zip";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, "../../extension");
const outDir = resolve(here, "../public");
const outFile = resolve(outDir, "companion-extension.zip");

// Dev-only files that should NOT ship inside the downloadable extension.
const EXCLUDE_TOP = new Set(["package.json", "node_modules", ".DS_Store", "PUBLISHING.md"]);

try {
  if (!existsSync(extDir)) {
    console.warn(`[pack-extension] ${extDir} not found — skipping (download not refreshed).`);
    process.exit(0);
  }
  const zip = new AdmZip();
  zip.addLocalFolder(extDir, "", (name) => {
    const top = String(name).split(/[/\\]/)[0];
    return !EXCLUDE_TOP.has(top) && !String(name).includes("node_modules");
  });
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  zip.writeZip(outFile);
  console.log(`[pack-extension] wrote ${outFile}`);
} catch (e) {
  console.warn(`[pack-extension] failed (non-fatal): ${e.message}`);
  process.exit(0);
}
