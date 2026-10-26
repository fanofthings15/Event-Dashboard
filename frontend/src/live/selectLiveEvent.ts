import type { NormalizedEvent } from "../types";
import { isLiveNow } from "../eventStatus";
import { interest, STAY_BONUS, type Ranking } from "./multiGame";

// Esports titles the display shows (as their live stream). Dota 2 and
// StarCraft II are deliberately left out — the display never picks them.
export const ESPORTS_SPORTS = new Set(["cs2", "lol", "valorant", "rocket-league", "overwatch", "r6siege"]);

// Every sport the /live display has a view for.
export const LIVE_VIEW_SPORTS = new Set(["nfl", "ncaaf", "nba", "nhl", "mlb", "f1", "frc", ...ESPORTS_SPORTS]);

export const eventKey = (e: NormalizedEvent) => `${e.sport}-${e.id}`;

// The one-game display's pick, ranked the same way as the multi-game
// layouts (interest() in multiGame.ts: how big the event is, what's
// happening in it, followed teams):
//   1. only live events in a sport the display can render — "live" as the
//      dashboard counts it (isLiveNow): past its start time and not over,
//      even before the source flips its status (small PandaScore events
//      can sit at not_started long after they've begun)
//   2. highest interest first
//   3. sticky: the game already on screen keeps a margin, so two games of
//      about the same interest don't swap on every poll
// `arrivals`: games that have only just gone live, which get the same bonus
// as the one on screen for this pick, so a bigger new game can take over.
export function selectLiveEvent(events: NormalizedEvent[], currentKey: string | null, ranking?: Ranking, arrivals: Set<string> = new Set()): NormalizedEvent | null {
  const now = new Date();
  const live = events.filter((e) => isLiveNow(e, now) && LIVE_VIEW_SPORTS.has(e.sport));
  if (live.length === 0) return null;
  const t = now.getTime();
  const score = (e: NormalizedEvent) => interest(e, t, {}, ranking) + (eventKey(e) === currentKey || arrivals.has(eventKey(e)) ? STAY_BONUS : 0);
  return [...live].sort((a, b) => score(b) - score(a) || new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
}
