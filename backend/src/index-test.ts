import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { unzipSync } from "fflate";
import nfl from "./routes/nfl.js";
import nba from "./routes/nba.js";
import nhl from "./routes/nhl.js";
import f1 from "./routes/f1.js";
import frc from "./routes/frc.js";
import esports from "./routes/esports.js";
import settings from "./routes/settings.js";
import customEvents from "./routes/customEvents.js";

// Static top-level import so Bun's compiler can statically detect and embed
// this file into the .exe when running `bun build --compile`. This always
// evaluates on module load (even in plain dev mode) — that's why an empty
// placeholder ui-dist.zip is committed, so the import never fails to resolve
// before you've run `bun run build:ui` for real.
// [TEST STUB] Bun-only import stripped for Node-based verification

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3020;

// Bun rewrites embedded-file imports to an internal "$bunfs/..." path only
// inside a compiled executable — in dev or `bun run start` from source, the
// import just returns the literal relative path string. This is a more
// reliable check than the exe's file extension, since it works for any
// --target (Windows, Linux, macOS), not just Windows's ".exe" suffix.
function isCompiledExe(): boolean {
  return false; // [TEST STUB] always source-mode for this isolated test
}

// Where the built frontend's static files live, for whichever mode we're
// running in. Returns null if there's nothing to serve yet (e.g. dev mode
// before `vite build`, or a still-empty placeholder zip) — in that case the
// backend just serves the API and you're expected to be running the Vite
// dev server separately for the UI.
function resolveUiDir(): string | null {
  if (isCompiledExe()) {
    try {
      const zipBytes = fs.readFileSync("unreachable-in-this-test");
      const files = unzipSync(new Uint8Array(zipBytes));
      if (Object.keys(files).length === 0) return null; // empty placeholder, nothing real embedded

      const tempDir = path.join(os.tmpdir(), "event-dashboard-ui");
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.mkdirSync(tempDir, { recursive: true });
      for (const [name, data] of Object.entries(files)) {
        if (name.endsWith("/")) continue;
        const outPath = path.join(tempDir, name);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, data);
      }
      return tempDir;
    } catch (err) {
      console.error("Failed to unpack embedded UI:", err);
      return null;
    }
  }

  // Running from source: after `bun run build:ui`, the built frontend lives
  // at frontend/dist, two levels up from this compiled backend/src file.
  const sourceDist = path.join(__dirname, "../../frontend/dist");
  return fs.existsSync(sourceDist) ? sourceDist : null;
}

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/nfl", nfl);
app.use("/api/nba", nba);
app.use("/api/nhl", nhl);
app.use("/api/f1", f1);
app.use("/api/frc", frc);
app.use("/api/esports", esports);
app.use("/api/settings", settings);
app.use("/api/custom-events", customEvents);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Production/exe: serve the built frontend from this same port — from
// frontend/dist when run from source, or unpacked from the embedded zip
// when run as a compiled .exe. In dev, the Vite dev server runs separately
// (default :5290) and proxies /api to this port instead.
const uiDir = resolveUiDir();
if (uiDir) {
  app.use(express.static(uiDir));
  app.get("*", (_req, res) => res.sendFile(path.join(uiDir, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Event dashboard backend running on http://localhost:${PORT}`);
  if (!uiDir) {
    console.log("No built frontend found yet — run the Vite dev server separately (bun run dev), or `bun run build:ui` first for a production-style run.");
  }
});
