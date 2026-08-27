import { useCallback, useEffect, useRef, useState } from "react";
import { reauthAwareFetch } from "./authFetch";
import type { NormalizedEvent } from "./types";

interface SourceResult {
  events: NormalizedEvent[];
  source?: string;
  warning?: string;
  warnings?: string[];
  error?: string;
}

interface FeedState {
  events: NormalizedEvent[];
  allEvents: NormalizedEvent[]; // before league exclusion — used by the league picker
  warnings: string[];
  loading: boolean;
  refreshing: boolean;
  lastUpdated: Date | null;
  isOffline: boolean;
  refetch: () => void;
}

const OFFLINE_CACHE_KEY = "event-dashboard-offline-cache";

function saveOfflineCache(events: NormalizedEvent[]) {
  try {
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify({ events, savedAt: Date.now() }));
  } catch {
    // Not critical — offline fallback just won't have anything to show.
  }
}

function loadOfflineCache(): { events: NormalizedEvent[]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
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

function matchesExcluded(league: string, excludedLeagues: string[]): boolean {
  const l = league.toLowerCase();
  return excludedLeagues.some((ex) => ex.trim() && l.includes(ex.trim().toLowerCase()));
}

// Include-list: empty means show every region. Only applies to events that
// actually have a region (FRC currently) — everything else passes through.
function matchesRegion(e: NormalizedEvent, frcRegions: string[]): boolean {
  if (!e.region || frcRegions.length === 0) return true;
  return frcRegions.includes(e.region);
}

// A followed team/event bypasses league/region filters — "I don't care
// about the whole league, but I care about my team" (e.g. excluding most
// NCAAF conferences while still following one team in one of them). Custom
// events are the user's own and are never league/region-filtered at all.
// This also governs the notify loop below, so a followed team now notifies
// even in an otherwise-hidden league — the whole point of following it.
function isHiddenByFilters(e: NormalizedEvent, excludedLeagues: string[], frcRegions: string[]): boolean {
  if (e.sport === "custom" || e.followed || e.manuallyFollowed) return false;
  return matchesExcluded(e.league, excludedLeagues) || !matchesRegion(e, frcRegions);
}

// Exact match (case-insensitive), not a substring or word-boundary match —
// a saved favorite has to equal a team's full name. Word-boundary matching
// still let a generic word like "spirit" false-match an unrelated team
// ("HyperSpirit"); exact match closes that off entirely. The detail view's
// per-team ☆ button (EventDetailModal.tsx) is what makes this practical —
// it saves the team's name exactly as the source reports it, so there's no
// need to guess the right spelling by hand.
function matchesFavoriteTeamName(haystack: string, favorite: string): boolean {
  const t = favorite.trim().toLowerCase();
  return t.length > 0 && haystack.trim().toLowerCase() === t;
}

// Cross-sport favorite-team tagging: matches a saved team name against an
// event's team list (or its combined name, for sources without a teams
// array) case-insensitively. Reuses the same "followed" flag FRC's
// team-follow feature already uses, so every existing badge/UI just works.
function withFavoriteTeams(e: NormalizedEvent, favoriteTeams: string[]): NormalizedEvent {
  if (e.followed || favoriteTeams.length === 0) return e;
  const haystacks = e.teams?.length ? e.teams.map((t) => t.name) : [e.name];
  const matched = favoriteTeams.some((team) => haystacks.some((h) => matchesFavoriteTeamName(h, team)));
  return matched ? { ...e, followed: true } : e;
}

// A one-off manual follow on a specific event (the detail view's "Follow
// event" button), independent of team-name matching. Kept as a distinct
// flag from `followed` so the UI can show a different badge for "you
// followed this specific event" vs "a team you follow is playing."
function withManualFollow(e: NormalizedEvent, followedEventIds: string[]): NormalizedEvent {
  if (e.manuallyFollowed) return e;
  return followedEventIds.includes(`${e.sport}-${e.id}`) ? { ...e, manuallyFollowed: true } : e;
}

export type NotifyReason = "live" | "upcoming";

export function useEvents(
  disabledCoreSources: string[],
  excludedLeagues: string[],
  frcRegions: string[],
  favoriteTeams: string[],
  followedEventIds: string[],
  snoozedEventIds: string[],
  notifyLeadMinutes: number[],
  pollMs = 60_000,
  onNotify?: (e: NormalizedEvent, reason: NotifyReason, leadMinutes?: number) => void
): FeedState {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [allEvents, setAllEvents] = useState<NormalizedEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const prevLiveIds = useRef<Set<string>>(new Set());
  const notifiedUpcoming = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setRefreshing(true);

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
          const r = await reauthAwareFetch(url);
          if (!r) return { events: [], error: `Session expired, reloading… (${url})` } as SourceResult;
          return (await r.json()) as SourceResult;
        } catch {
          return { events: [], error: `Could not reach ${url}` } as SourceResult;
        }
      })
    );

    // Every single request failed — likely offline. Fall back to the last
    // successfully-loaded snapshot instead of showing an empty dashboard.
    if (results.length > 0 && results.every((r) => r.error)) {
      const cached = loadOfflineCache();
      setIsOffline(true);
      if (cached) {
        setEvents(cached.events);
        setAllEvents(cached.events);
        setWarnings([`Offline — showing cached data from ${new Date(cached.savedAt).toLocaleTimeString()}.`]);
      } else {
        setWarnings(["Offline, and no cached data yet from a previous successful sync."]);
      }
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setIsOffline(false);

    const merged = results
      .flatMap((r) => r.events ?? [])
      .map((e) => withFavoriteTeams(e, favoriteTeams))
      .map((e) => withManualFollow(e, followedEventIds));
    merged.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    if (onNotify) {
      const nowLiveIds = new Set<string>();
      const nowMs = Date.now();
      // 0 is a no-op here — "at start" is already always covered by the
      // live-transition branch below, regardless of what's selected.
      const reminderLeads = notifyLeadMinutes.filter((m) => m > 0);

      for (const e of merged) {
        const key = `${e.sport}-${e.id}`;
        if (snoozedEventIds.includes(key) || isHiddenByFilters(e, excludedLeagues, frcRegions)) continue;

        if (e.status === "live") {
          nowLiveIds.add(key);
          if (!prevLiveIds.current.has(key)) onNotify(e, "live");
          continue;
        }

        if (reminderLeads.length > 0 && e.status === "upcoming") {
          const msUntilStart = new Date(e.startTime).getTime() - nowMs;
          for (const lead of reminderLeads) {
            const leadKey = `${key}-${lead}`;
            if (notifiedUpcoming.current.has(leadKey)) continue;
            if (msUntilStart > 0 && msUntilStart <= lead * 60_000) {
              notifiedUpcoming.current.add(leadKey);
              onNotify(e, "upcoming", lead);
            }
          }
        }
      }
      prevLiveIds.current = nowLiveIds;
    }

    const filtered = merged.filter((e) => !isHiddenByFilters(e, excludedLeagues, frcRegions));

    const nextWarnings = results.flatMap((r) => {
      if (r.warnings) return r.warnings;
      if (r.warning) return [r.warning];
      if (r.error) return [r.error];
      return [];
    });

    saveOfflineCache(filtered);
    setAllEvents(merged);
    setEvents(filtered);
    setWarnings(nextWarnings);
    setLoading(false);
    setRefreshing(false);
    setLastUpdated(new Date());
  }, [
    disabledCoreSources.join(","),
    excludedLeagues.join(","),
    frcRegions.join(","),
    favoriteTeams.join(","),
    followedEventIds.join(","),
    snoozedEventIds.join(","),
    notifyLeadMinutes.join(","),
    onNotify,
  ]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { events, allEvents, warnings, loading, refreshing, lastUpdated, isOffline, refetch: load };
}
