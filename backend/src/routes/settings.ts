import { Router } from "express";
import { readUserSettings, writeUserSettings, regenerateIcsToken, type UserSettings } from "../settings.js";
import { getUserId } from "../userContext.js";
import { ESPORTS_CATALOG } from "../esportsCatalog.js";

const router = Router();

// Per-user preferences only — scoped by the requesting user's Authentik uid
// (X-authentik-uid, see userContext.ts). The two global API keys
// (pandaScoreApiKey/tbaApiKey) intentionally never appear on this router at
// all, in either direction — they live behind /api/global-settings
// (routes/globalSettings.ts), which is admin-gated. Don't add them back
// here even as a convenience — that's exactly the "any friend can overwrite
// the shared API key" bug this split exists to fix.
router.get("/", (req, res) => {
  const settings = readUserSettings(getUserId(req));
  res.json({
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
    icsToken: settings.icsToken,
    streamSlots: settings.streamSlots,
    streamMainSlotId: settings.streamMainSlotId,
    streamLayout: settings.streamLayout,
    esportsCatalog: ESPORTS_CATALOG,
  });
});

// Rotates the calendar feed's secret token — for when a link has leaked or
// been shared somewhere it shouldn't. Deliberately not part of the regular
// POST / merge below: this is a server-generated value, never client-set.
router.post("/regenerate-ics-token", (req, res) => {
  res.json({ icsToken: regenerateIcsToken(getUserId(req)) });
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  const next: Partial<UserSettings> = {};

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

  if (Array.isArray(body.streamSlots)) {
    next.streamSlots = body.streamSlots.filter(
      (s: any) => s && typeof s.id === "string" && typeof s.label === "string" && typeof s.url === "string"
    );
  }
  if (typeof body.streamMainSlotId === "string" || body.streamMainSlotId === null) {
    next.streamMainSlotId = body.streamMainSlotId;
  }
  if (body.streamLayout === "grid" || body.streamLayout === "solo" || body.streamLayout === "duo" || body.streamLayout === "quad") {
    next.streamLayout = body.streamLayout;
  }

  writeUserSettings(getUserId(req), next);
  res.json({ ok: true });
});

export default router;
