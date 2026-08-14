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
    frcFollowEnabled: settings.frcFollowEnabled,
    frcRegions: settings.frcRegions,
    excludedLeagues: settings.excludedLeagues,
    disabledCoreSources: settings.disabledCoreSources,
    enabledEsportsGames: settings.enabledEsportsGames,
    customEvents: settings.customEvents,
    sportColorOverrides: settings.sportColorOverrides,
    favoriteTeams: settings.favoriteTeams,
    notifyOnLive: settings.notifyOnLive,
    pollIntervalSeconds: settings.pollIntervalSeconds,
    theme: settings.theme,
    icsFavoritesOnly: settings.icsFavoritesOnly,
    followedEventIds: settings.followedEventIds,
    notifyMode: settings.notifyMode,
    dismissedFinishedEventIds: settings.dismissedFinishedEventIds,
    notifyLeadMinutes: settings.notifyLeadMinutes,
    notifySoundEnabled: settings.notifySoundEnabled,
    snoozedEventIds: settings.snoozedEventIds,
    compactCards: settings.compactCards,
    timezone: settings.timezone,
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
  if (typeof body.frcFollowEnabled === "boolean") next.frcFollowEnabled = body.frcFollowEnabled;
  if (Array.isArray(body.frcRegions)) next.frcRegions = body.frcRegions.filter((x: unknown) => typeof x === "string");
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
  if (body.sportColorOverrides && typeof body.sportColorOverrides === "object") {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(body.sportColorOverrides)) {
      if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) clean[key] = value;
    }
    next.sportColorOverrides = clean;
  }
  if (Array.isArray(body.favoriteTeams)) next.favoriteTeams = body.favoriteTeams.filter((x: unknown) => typeof x === "string");
  if (typeof body.notifyOnLive === "boolean") next.notifyOnLive = body.notifyOnLive;
  if (typeof body.pollIntervalSeconds === "number" && body.pollIntervalSeconds >= 15) {
    next.pollIntervalSeconds = Math.floor(body.pollIntervalSeconds);
  }
  if (body.theme === "dark" || body.theme === "light") next.theme = body.theme;
  if (typeof body.icsFavoritesOnly === "boolean") next.icsFavoritesOnly = body.icsFavoritesOnly;
  if (Array.isArray(body.followedEventIds)) next.followedEventIds = body.followedEventIds.filter((x: unknown) => typeof x === "string");
  if (body.notifyMode === "followed" || body.notifyMode === "all") next.notifyMode = body.notifyMode;
  if (Array.isArray(body.dismissedFinishedEventIds)) {
    next.dismissedFinishedEventIds = body.dismissedFinishedEventIds.filter((x: unknown) => typeof x === "string");
  }
  if (Array.isArray(body.notifyLeadMinutes)) {
    next.notifyLeadMinutes = body.notifyLeadMinutes
      .filter((x: unknown) => typeof x === "number" && x >= 0)
      .map((x: number) => Math.floor(x));
  }
  if (typeof body.notifySoundEnabled === "boolean") next.notifySoundEnabled = body.notifySoundEnabled;
  if (Array.isArray(body.snoozedEventIds)) next.snoozedEventIds = body.snoozedEventIds.filter((x: unknown) => typeof x === "string");
  if (typeof body.compactCards === "boolean") next.compactCards = body.compactCards;
  if (typeof body.timezone === "string") {
    if (body.timezone === "") {
      next.timezone = "";
    } else {
      try {
        // Intl throws RangeError on an invalid IANA zone — validate here so
        // a bad value can never reach the frontend's date formatting and
        // crash every single time formatter across the app.
        new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
        next.timezone = body.timezone;
      } catch {
        // Silently ignored — invalid zone, keep whatever was set before.
      }
    }
  }

  writeSettings(next);
  res.json({ ok: true });
});

export default router;
