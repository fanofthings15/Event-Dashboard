import fs from "fs";
import path from "path";
import os from "os";
import { readUserSettings } from "./settings.js";
import { sendDiscordWebhook } from "./discordNotify.js";
import type { NormalizedEvent } from "./types.js";

// Same directory settings.ts writes per-user files under — read directly
// here (rather than adding a "list every known user" export there) since
// this is the only caller that ever needs to enumerate every user at once.
const USERS_DIR = path.join(os.homedir(), ".event-dashboard", "users");

// Where the mute link in each notification points — has to be the real
// public hostname, not localhost, since it's opened from Discord's own
// client (desktop/mobile), never from this server. Overridable via env for
// anyone self-hosting this on a different domain.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "https://events.omurray.me";

const LIVE_COLOR = 0xef4444;
const UPCOMING_COLOR = 0x4f8dfd;

function muteUrl(muteToken: string, eventKey: string): string {
  return `${PUBLIC_BASE_URL}/api/discord/mute?event=${encodeURIComponent(eventKey)}&t=${muteToken}`;
}

async function notify(userId: string, webhookUrl: string, muteToken: string, eventKey: string, title: string, league: string, color: number): Promise<void> {
  try {
    await sendDiscordWebhook(webhookUrl, {
      title,
      description: `${league}\n\n🔇 [Mute this event](${muteUrl(muteToken, eventKey)})`,
      color,
    });
  } catch (err) {
    console.error(`[discord-scheduler] send failed for user ${userId}:`, err);
  }
}

const CORE_ENDPOINTS: Record<string, string> = {
  nfl: "/api/nfl",
  f1: "/api/f1",
  nba: "/api/nba",
  nhl: "/api/nhl",
  mlb: "/api/mlb",
  ncaaf: "/api/ncaaf",
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
// happens client-side today), so it's replicated here for this scheduler to
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
  if (!settings.notifyOnLive || !settings.discordWebhookUrl) return;

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
        await notify(userId, settings.discordWebhookUrl, settings.discordMuteToken, key, `🔴 ${e.name} is live`, e.league, LIVE_COLOR);
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
          const when = lead === 0 ? "now" : `in ${lead} min`;
          await notify(userId, settings.discordWebhookUrl, settings.discordMuteToken, key, `⏰ ${e.name} starts ${when}`, e.league, UPCOMING_COLOR);
        }
      }
    }
  }

  state.prevLiveIds = nowLiveIds;
}

// Starts the recurring tick that drives Discord notifications, independent
// of whether anyone has the app open — on a timer, for every user who has
// both notifications and a Discord webhook URL configured. Replaced an
// in-page browser Notification()/Web Push pair that depended on OS/browser
// notification permissions actually working, which in practice didn't
// reliably — this just needs the webhook URL to still be valid.
export function startDiscordScheduler(port: number): void {
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
        console.error(`[discord-scheduler] tick failed for user ${userId}:`, err);
      }
    }
  };

  tick();
  setInterval(tick, TICK_MS);
}
