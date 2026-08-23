import fs from "fs";
import path from "path";
import os from "os";
import { readUserSettings } from "./settings.js";
import { sendPushToUser } from "./push.js";
import type { NormalizedEvent } from "./types.js";

// Same directory settings.ts writes per-user files under — read directly
// here (rather than adding a "list every known user" export there) since
// this is the only caller that ever needs to enumerate every user at once.
const USERS_DIR = path.join(os.homedir(), ".event-dashboard", "users");

const CORE_ENDPOINTS: Record<string, string> = {
  nfl: "/api/nfl",
  f1: "/api/f1",
  nba: "/api/nba",
  nhl: "/api/nhl",
  frc: "/api/frc",
};

const TICK_MS = 60_000;

interface SourceResult {
  events?: NormalizedEvent[];
}

// Exact match (case-insensitive) — see the identical helper in
// frontend/src/useEvents.ts for why this isn't a substring/word-boundary
// match: a saved favorite has to equal a team's full name.
function matchesFavoriteTeamName(haystack: string, favorite: string): boolean {
  const t = favorite.trim().toLowerCase();
  return t.length > 0 && haystack.trim().toLowerCase() === t;
}

// Mirrors frontend/src/useEvents.ts's withFavoriteTeams — the raw per-source
// API responses don't know about a user's favoriteTeams list (that matching
// happens client-side today), so it's replicated here for the push path to
// gate on the same "followed" definition the in-page notifications use.
function matchesFavoriteTeam(e: NormalizedEvent, favoriteTeams: string[]): boolean {
  if (e.followed || favoriteTeams.length === 0) return false;
  const haystacks = e.teams?.length ? e.teams.map((t) => t.name) : [e.name];
  return favoriteTeams.some((team) => haystacks.some((h) => matchesFavoriteTeamName(h, team)));
}

// Mirrors frontend/src/useEvents.ts's matchesExcluded/matchesRegion — a
// league or FRC region the user has hidden shouldn't be able to notify
// either, even if a favorite team happens to be playing in it. Custom events
// are the user's own and are never league/region-filtered.
function isHiddenByFilters(e: NormalizedEvent, excludedLeagues: string[], frcRegions: string[]): boolean {
  if (e.sport === "custom") return false;
  const l = e.league.toLowerCase();
  const leagueExcluded = excludedLeagues.some((ex) => ex.trim() && l.includes(ex.trim().toLowerCase()));
  const regionExcluded = Boolean(e.region) && frcRegions.length > 0 && !frcRegions.includes(e.region!);
  return leagueExcluded || regionExcluded;
}

// Per-user memory of what's already been notified, so a live game doesn't
// re-fire every tick and an upcoming reminder doesn't fire twice. Lives only
// in process memory — resets on restart, same as the frontend's equivalent
// (useRef state) resets on a page reload.
interface UserPushState {
  prevLiveIds: Set<string>;
  notifiedUpcoming: Set<string>;
}
const stateByUser = new Map<string, UserPushState>();

async function fetchUserEvents(baseUrl: string, userId: string, disabledCoreSources: string[]): Promise<NormalizedEvent[]> {
  const endpoints = [
    ...Object.entries(CORE_ENDPOINTS)
      .filter(([sport]) => !disabledCoreSources.includes(sport))
      .map(([, url]) => url),
    "/api/esports",
    "/api/custom-events",
  ];

  const results = await Promise.all(
    endpoints.map(async (url) => {
      try {
        const r = await fetch(`${baseUrl}${url}`, { headers: { "X-authentik-uid": userId } });
        if (!r.ok) return { events: [] } as SourceResult;
        return (await r.json()) as SourceResult;
      } catch {
        return { events: [] } as SourceResult;
      }
    })
  );

  return results.flatMap((r) => r.events ?? []);
}

async function tickUser(baseUrl: string, userId: string): Promise<void> {
  const settings = readUserSettings(userId);
  if (!settings.notifyOnLive || settings.pushSubscriptions.length === 0) return;

  const events = await fetchUserEvents(baseUrl, userId, settings.disabledCoreSources);
  const reminderLeads = settings.notifyLeadMinutes.filter((m) => m > 0);
  const nowMs = Date.now();

  let state = stateByUser.get(userId);
  if (!state) {
    state = { prevLiveIds: new Set(), notifiedUpcoming: new Set() };
    stateByUser.set(userId, state);
  }
  const nowLiveIds = new Set<string>();

  for (const e of events) {
    const key = `${e.sport}-${e.id}`;
    if (settings.snoozedEventIds.includes(key) || isHiddenByFilters(e, settings.excludedLeagues, settings.frcRegions)) continue;

    const isFollowed =
      Boolean(e.followed) ||
      Boolean(e.manuallyFollowed) ||
      settings.followedEventIds.includes(key) ||
      matchesFavoriteTeam(e, settings.favoriteTeams);
    if (settings.notifyMode === "followed" && !isFollowed) continue;

    if (e.status === "live") {
      nowLiveIds.add(key);
      if (!state.prevLiveIds.has(key)) {
        await sendPushToUser(userId, { title: `${e.name} is live`, body: e.league, tag: `${key}-live` });
      }
      continue;
    }

    if (reminderLeads.length > 0 && e.status === "upcoming") {
      const msUntilStart = new Date(e.startTime).getTime() - nowMs;
      for (const lead of reminderLeads) {
        const leadKey = `${key}-${lead}`;
        if (state.notifiedUpcoming.has(leadKey)) continue;
        if (msUntilStart > 0 && msUntilStart <= lead * 60_000) {
          state.notifiedUpcoming.add(leadKey);
          await sendPushToUser(userId, { title: `${e.name} starts in ${lead} min`, body: e.league, tag: `${key}-upcoming-${lead}` });
        }
      }
    }
  }

  state.prevLiveIds = nowLiveIds;
}

// Starts the recurring tick that drives push notifications while nobody has
// the app open — everything the in-page Notification path already does
// (frontend/src/useEvents.ts) reactively per open tab, this does on a timer
// for every user who has both notifications and at least one push
// subscription turned on.
export function startPushScheduler(port: number): void {
  const baseUrl = `http://localhost:${port}`;

  const tick = async () => {
    let userIds: string[];
    try {
      userIds = fs.readdirSync(USERS_DIR);
    } catch {
      return; // no users have loaded settings yet
    }
    for (const userId of userIds) {
      try {
        await tickUser(baseUrl, userId);
      } catch (err) {
        console.error(`[push-scheduler] tick failed for user ${userId}:`, err);
      }
    }
  };

  tick();
  setInterval(tick, TICK_MS);
}
