import { Router } from "express";
import { readSettings, writeSettings } from "../settings.js";

const router = Router();

router.get("/", (_req, res) => {
  const settings = readSettings();
  // Don't echo the full key back to the client — just whether one is set.
  res.json({
    pandaScoreApiKeySet: Boolean(settings.pandaScoreApiKey),
    followedTeams: settings.followedTeams,
  });
});

router.post("/", (req, res) => {
  const { pandaScoreApiKey, followedTeams } = req.body ?? {};
  const next: Record<string, unknown> = {};
  if (typeof pandaScoreApiKey === "string" && pandaScoreApiKey.length > 0) next.pandaScoreApiKey = pandaScoreApiKey;
  if (Array.isArray(followedTeams)) next.followedTeams = followedTeams;
  writeSettings(next);
  res.json({ ok: true });
});

export default router;
