import { useCallback, useEffect, useState } from "react";
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
  refetch: () => void;
}

const CORE_ENDPOINTS: Record<string, string> = {
  nfl: "/api/nfl",
  f1: "/api/f1",
  nba: "/api/nba",
  nhl: "/api/nhl",
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

export function useEvents(
  disabledCoreSources: string[],
  excludedLeagues: string[],
  frcRegions: string[],
  pollMs = 60_000
): FeedState {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [allEvents, setAllEvents] = useState<NormalizedEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
          const r = await fetch(url);
          return (await r.json()) as SourceResult;
        } catch {
          return { events: [], error: `Could not reach ${url}` } as SourceResult;
        }
      })
    );

    const merged = results.flatMap((r) => r.events ?? []);
    merged.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // Custom events are the user's own — never league-filtered.
    const filtered = merged.filter(
      (e) => (e.sport === "custom" || !matchesExcluded(e.league, excludedLeagues)) && matchesRegion(e, frcRegions)
    );

    const nextWarnings = results.flatMap((r) => {
      if (r.warnings) return r.warnings;
      if (r.warning) return [r.warning];
      if (r.error) return [r.error];
      return [];
    });

    setAllEvents(merged);
    setEvents(filtered);
    setWarnings(nextWarnings);
    setLoading(false);
    setRefreshing(false);
    setLastUpdated(new Date());
  }, [disabledCoreSources.join(","), excludedLeagues.join(","), frcRegions.join(",")]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { events, allEvents, warnings, loading, refreshing, lastUpdated, refetch: load };
}
