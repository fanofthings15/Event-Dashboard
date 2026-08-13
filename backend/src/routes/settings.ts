import { Router } from "express";
import { readSettings, writeSettings, type CustomEvent } from "../settings.js";
import { ESPORTS_CATALOG } from "../esportsCatalog.js";

const router = Router();

router.get("/", (_req, res) => {
  const settings = readSettings();
  res.json({
    pandaScoreApiKeySet: Boolean(settings.pandaScoreApiKey),
    excludedLeagues: settings.excludedLeagues,
    disabledCoreSources: settings.disabledCoreSources,
    enabledEsportsGames: settings.enabledEsportsGames,
    customEvents: settings.customEvents,
    esportsCatalog: ESPORTS_CATALOG,
  });
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  const next: Partial<{
    pandaScoreApiKey: string;
    excludedLeagues: string[];
    disabledCoreSources: string[];
    enabledEsportsGames: string[];
    customEvents: CustomEvent[];
  }> = {};

  if (typeof body.pandaScoreApiKey === "string" && body.pandaScoreApiKey.length > 0) {
    next.pandaScoreApiKey = body.pandaScoreApiKey;
  }
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
