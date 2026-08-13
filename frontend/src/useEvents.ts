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

const ENDPOINTS = ["/api/nfl", "/api/f1", "/api/esports"];

export function useEvents(pollMs = 60_000): FeedState {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const results = await Promise.all(
      ENDPOINTS.map(async (url) => {
        try {
          const r = await fetch(url);
          return (await r.json()) as SourceResult;
        } catch {
          return { events: [], error: `Could not reach ${url}` } as SourceResult;
        }
      })
    );

    const nextEvents = results.flatMap((r) => r.events ?? []);
    // Soonest event first, so the next thing to plan for is always at the top.
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
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { events, warnings, loading, refreshing, lastUpdated, refetch: load };
}
