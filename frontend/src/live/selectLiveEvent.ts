import type { NormalizedEvent } from "../types";

// Esports titles the display shows (as their live stream). Dota 2 and
// StarCraft II are deliberately left out — the display never picks them.
export const ESPORTS_SPORTS = new Set(["cs2", "lol", "valorant", "rocket-league", "overwatch", "r6siege"]);

// Every sport the /live display has a view for.
export const LIVE_VIEW_SPORTS = new Set(["nfl", "ncaaf", "nba", "nhl", "mlb", "f1", "frc", ...ESPORTS_SPORTS]);

export const eventKey = (e: NormalizedEvent) => `${e.sport}-${e.id}`;

// PLACEHOLDER POLICY — this is the one function that decides what the
// display shows, so changing how games get picked only means editing this.
// Current behaviour, until a real rule is chosen:
//   1. only live events in a sport the display can render
//   2. ranked: manually followed event > followed team > everything else,
//      then most recently started
//   3. sticky: the game already on screen stays until it ends or something
//      ranked strictly higher goes live, so the screen doesn't flip back and
//      forth between two equal games every poll
export function selectLiveEvent(events: NormalizedEvent[], currentKey: string | null): NormalizedEvent | null {
  const live = events.filter((e) => e.status === "live" && LIVE_VIEW_SPORTS.has(e.sport));
  if (live.length === 0) return null;

  const rank = (e: NormalizedEvent) => (e.manuallyFollowed ? 0 : e.followed ? 1 : 2);
  const best = [...live].sort((a, b) => rank(a) - rank(b) || new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
  const current = live.find((e) => eventKey(e) === currentKey);
  return current && rank(current) <= rank(best) ? current : best;
}
