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
  warnings: string[];
  loading: boolean;
  refreshing: boolean;
  lastUpdated: Date | null;
  refetch: () => void;
}

const CORE_ENDPOINTS: Record<string, string> = {
  nfl: "/api/nfl",
  f1: "/api/f1",
};

function matchesExcluded(league: string, excludedLeagues: string[]): boolean {
  const l = league.toLowerCase();
  return excludedLeagues.some((ex) => ex.trim() && l.includes(ex.trim().toLowerCase()));
}

export function useEvents(disabledCoreSources: string[], excludedLeagues: string[], pollMs = 60_000): FeedState {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
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

    let nextEvents = results.flatMap((r) => r.events ?? []);
    // Custom events are the user's own — never league-filtered.
    nextEvents = nextEvents.filter((e) => e.sport === "custom" || !matchesExcluded(e.league, excludedLeagues));
    nextEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const nextWarnings = results.flatMap((r) => {
      if (r.warnings) return r.warnings;
      if (r.warning) return [r.warning];
      if (r.error) return [r.error];
      return [];
    });

    setEvents(nextEvents);
    setWarnings(nextWarnings);
    setLoading(false);
    setRefreshing(false);
    setLastUpdated(new Date());
  }, [disabledCoreSources.join(","), excludedLeagues.join(",")]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { events, warnings, loading, refreshing, lastUpdated, refetch: load };
}
