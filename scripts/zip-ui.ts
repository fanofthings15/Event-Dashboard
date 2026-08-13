// Zips frontend/dist into backend/ui-dist.zip using fflate (a JS library),
// deliberately NOT the system `zip` command — Windows doesn't ship one, and
// this way `bun run build:exe` works identically on your machine and in
// GitHub Actions without needing to install anything extra.

import { zipSync } from "fflate";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, relative, sep } from "path";

const DIST_DIR = join(import.meta.dir, "../frontend/dist");
const OUT_ZIP = join(import.meta.dir, "../backend/ui-dist.zip");

if (!existsSync(DIST_DIR)) {
  console.error(`No built frontend found at ${DIST_DIR} — run "bun run build:ui" first.`);
  process.exit(1);
}

function collectFiles(dir: string, base: string, out: Record<string, Uint8Array>) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, base, out);
    } else {
      const rel = relative(base, full).split(sep).join("/");
      out[rel] = new Uint8Array(readFileSync(full));
    }
  }
}

const files: Record<string, Uint8Array> = {};
collectFiles(DIST_DIR, DIST_DIR, files);

if (Object.keys(files).length === 0) {
  console.error(`${DIST_DIR} is empty — nothing to zip.`);
  process.exit(1);
}

const zipped = zipSync(files, { level: 6 });
writeFileSync(OUT_ZIP, zipped);

console.log(`Zipped ${Object.keys(files).length} files into ${OUT_ZIP} (${(zipped.length / 1024).toFixed(1)} KB)`);
