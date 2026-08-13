import express from "express";
import path from "path";

const app = express();
const uiDir = path.resolve("/home/claude/event-dashboard/frontend/dist");
app.use(express.static(uiDir));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("*", (_req, res) => res.sendFile(path.join(uiDir, "index.html")));

app.listen(3021, () => console.log("test server up"));
