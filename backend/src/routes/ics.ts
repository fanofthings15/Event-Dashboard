import { Router } from "express";
import { readSettings } from "../settings.js";
import { matchesFavoriteTeam } from "../favoriteTeams.js";

const router = Router();

const CORE_ENDPOINTS: Record<string, string> = {
  nfl: "/api/nfl",
  nba: "/api/nba",
  nhl: "/api/nhl",
  f1: "/api/f1",
  frc: "/api/frc",
};

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function matchesExcluded(league: string, excludedLeagues: string[]): boolean {
  const l = league.toLowerCase();
  return excludedLeagues.some((ex) => ex.trim() && l.includes(ex.trim().toLowerCase()));
}

router.get("/", async (_req, res) => {
  const settings = readSettings();
  const port = process.env.PORT ? Number(process.env.PORT) : 3020;
  const base = `http://localhost:${port}`;

  // Mirrors the frontend's own source selection: skip disabled core sources
  // entirely (esports/custom-events routes already self-filter internally).
  const endpoints = [
    ...Object.entries(CORE_ENDPOINTS)
      .filter(([sport]) => !settings.disabledCoreSources.includes(sport))
      .map(([, url]) => url),
    "/api/esports",
    "/api/custom-events",
  ];

  const results = await Promise.allSettled(endpoints.map((p) => fetch(base + p).then((r) => r.json())));
  const events: any[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value?.events)) events.push(...r.value.events);
  }

  const followedSet = new Set(settings.followedEventIds);
  for (const e of events) {
    if (followedSet.has(`${e.sport}-${e.id}`)) e.manuallyFollowed = true;
  }

  let filtered = events.filter((e) => e.sport === "custom" || !matchesExcluded(e.league ?? "", settings.excludedLeagues));

  // When on, narrow the feed down to just favorited/followed teams instead
  // of everything currently enabled — for someone who wants their synced
  // calendar limited to specific teams, not just whole sports/leagues.
  // Custom events are the user's own and always included either way.
  if (settings.icsFavoritesOnly) {
    filtered = filtered.filter((e) => e.sport === "custom" || matchesFavoriteTeam(e, settings.favoriteTeams));
  }

  const nowStamp = toIcsDate(new Date().toISOString());
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Event Dashboard//EN", "CALSCALE:GREGORIAN"];

  for (const e of filtered) {
    if (!e.startTime) continue;
    const start = toIcsDate(e.startTime);
    // Prefer a known exact duration (e.g. custom events), then a multi-day
    // endTime, then fall back to a 2-hour block as a reasonable stand-in
    // for a single game/match/race with no known length.
    const end = e.durationMinutes
      ? toIcsDate(new Date(new Date(e.startTime).getTime() + e.durationMinutes * 60_000).toISOString())
      : e.endTime
        ? toIcsDate(e.endTime)
        : toIcsDate(new Date(new Date(e.startTime).getTime() + 2 * 60 * 60 * 1000).toISOString());

    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.sport}-${e.id}@event-dashboard`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcsText(e.name ?? "Event")}`,
      e.league ? `DESCRIPTION:${escapeIcsText(e.league)}` : "",
      e.venue ? `LOCATION:${escapeIcsText(e.venue)}` : "",
      e.detailUrl ? `URL:${e.detailUrl}` : "",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="event-dashboard.ics"');
  res.send(lines.filter(Boolean).join("\r\n"));
});

export default router;
