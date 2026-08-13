import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import nfl from "./routes/nfl.js";
import nba from "./routes/nba.js";
import nhl from "./routes/nhl.js";
import f1 from "./routes/f1.js";
import frc from "./routes/frc.js";
import esports from "./routes/esports.js";
import settings from "./routes/settings.js";
import customEvents from "./routes/customEvents.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3020;

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

// Production: serve the built frontend from this same port. In dev, the Vite
// dev server runs separately (default :5290) and proxies /api to this port instead.
const frontendDist = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));
app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));

app.listen(PORT, () => console.log(`Event dashboard backend running on http://localhost:${PORT}`));
