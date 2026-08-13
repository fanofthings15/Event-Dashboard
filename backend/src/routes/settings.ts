import { Router } from "express";
import { readSettings, writeSettings, type Settings } from "../settings.js";
import { ESPORTS_CATALOG } from "../esportsCatalog.js";

const router = Router();

router.get("/", (_req, res) => {
  const settings = readSettings();
  res.json({
    pandaScoreApiKeySet: Boolean(settings.pandaScoreApiKey),
    tbaApiKeySet: Boolean(settings.tbaApiKey),
    frcTeamKey: settings.frcTeamKey,
    excludedLeagues: settings.excludedLeagues,
    disabledCoreSources: settings.disabledCoreSources,
    enabledEsportsGames: settings.enabledEsportsGames,
    customEvents: settings.customEvents,
    esportsCatalog: ESPORTS_CATALOG,
  });
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  const next: Partial<Settings> = {};

  if (typeof body.pandaScoreApiKey === "string" && body.pandaScoreApiKey.length > 0) {
    next.pandaScoreApiKey = body.pandaScoreApiKey;
  }
  if (typeof body.tbaApiKey === "string" && body.tbaApiKey.length > 0) {
    next.tbaApiKey = body.tbaApiKey;
  }
  if (typeof body.frcTeamKey === "string") next.frcTeamKey = body.frcTeamKey;
  if (Array.isArray(body.excludedLeagues)) next.excludedLeagues = body.excludedLeagues.filter((x: unknown) => typeof x === "string");
  if (Array.isArray(body.disabledCoreSources)) next.disabledCoreSources = body.disabledCoreSources.filter((x: unknown) => typeof x === "string");
  if (Array.isArray(body.enabledEsportsGames)) next.enabledEsportsGames = body.enabledEsportsGames.filter((x: unknown) => typeof x === "string");
  if (Array.isArray(body.customEvents)) {
    next.customEvents = body.customEvents.filter(
      (e: any) =>
        e &&
        typeof e.id === "string" &&
        typeof e.name === "string" &&
        typeof e.league === "string" &&
        typeof e.color === "string" &&
        typeof e.startTime === "string" &&
        typeof e.durationMinutes === "number"
    );
  }

  writeSettings(next);
  res.json({ ok: true });
});

export default router;
