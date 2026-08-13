import { useEffect, useState } from "react";
import type { NormalizedEvent } from "./types";

interface SourceResult {
  events: NormalizedEvent[];
  source?: string;
  warning?: string;
  error?: string;
}

interface FeedState {
  events: NormalizedEvent[];
  warnings: string[];
  loading: boolean;
}

const ENDPOINTS = ["/api/nfl", "/api/f1", "/api/esports"];

export function useEvents(pollMs = 60_000): FeedState {
  const [state, setState] = useState<FeedState>({ events: [], warnings: [], loading: true });

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
      if (cancelled) return;

      const events = results.flatMap((r) => r.events ?? []);
      events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      const warnings = results.map((r) => r.warning || r.error).filter(Boolean) as string[];

      setState({ events, warnings, loading: false });
    }

    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return state;
}
