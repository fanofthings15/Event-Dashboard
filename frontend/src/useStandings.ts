import { useCallback, useState } from "react";
import type { StandingsGroup } from "./types";

export const STANDINGS_SPORTS = ["nfl", "nba", "nhl", "f1"] as const;
export type StandingsSport = (typeof STANDINGS_SPORTS)[number];

const STANDINGS_ENDPOINTS: Record<StandingsSport, string> = {
  nfl: "/api/nfl/standings",
  nba: "/api/nba/standings",
  nhl: "/api/nhl/standings",
  f1: "/api/f1/standings",
};

interface StandingsState {
  standingsBySport: Partial<Record<StandingsSport, StandingsGroup[]>>;
  loading: boolean;
  loaded: boolean;
  refetch: () => void;
}

// Unlike useEvents, this is not polled — standings move slowly, and fetching
// four endpoints on every app load (most of which never open the Standings
// tab) would be wasted work. Callers trigger `refetch` on first tab open.
export function useStandings(disabledCoreSources: string[]): StandingsState {
  const [standingsBySport, setStandingsBySport] = useState<Partial<Record<StandingsSport, StandingsGroup[]>>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sports = STANDINGS_SPORTS.filter((s) => !disabledCoreSources.includes(s));
    const results = await Promise.all(
      sports.map(async (sport) => {
        try {
          const r = await fetch(STANDINGS_ENDPOINTS[sport]);
          const data = await r.json();
          return [sport, (data.groups ?? []) as StandingsGroup[]] as const;
        } catch {
          return [sport, [] as StandingsGroup[]] as const;
        }
      })
    );
    setStandingsBySport(Object.fromEntries(results));
    setLoading(false);
    setLoaded(true);
  }, [disabledCoreSources.join(",")]);

  return { standingsBySport, loading, loaded, refetch: load };
}
