import type { NormalizedEvent } from "../types";
import { hasEventEnded, isLiveNow } from "../eventStatus";
import { canTakeOver, importance, interest, isOnBreak, STAY_BONUS, type InterestHints, type Ranking } from "./multiGame";

// Esports titles the display shows (as their live stream). Dota 2 and
// StarCraft II are deliberately left out — the display never picks them.
export const ESPORTS_SPORTS = new Set(["cs2", "lol", "valorant", "rocket-league", "overwatch", "r6siege"]);

// Every sport the /live display has a view for.
export const LIVE_VIEW_SPORTS = new Set(["nfl", "ncaaf", "nba", "nhl", "mlb", "f1", "frc", ...ESPORTS_SPORTS]);

export const eventKey = (e: NormalizedEvent) => `${e.sport}-${e.id}`;

// What the display counts as live: the dashboard's idea (isLiveNow, past
// its start time and not over), except that a CS match joins CS_LEAD_MS
// before its scheduled start, for the pre-show, so its stream is already up
// when the first round starts (the user's rule, 2026-11-10: the first round
// kept being missed; CS matches start up to ~5 min before the time PandaScore
// gives). It ranks as normal meanwhile — not as a break — so a far bigger
// match about to start can take the screen in time. The dashboard's LIVE
// badge and chime still go by the start time.
export const CS_LEAD_MS = 10 * 60_000;
export function isOnLiveDisplay(e: NormalizedEvent, now: Date): boolean {
  if (isLiveNow(e, now)) return true;
  return e.sport === "cs2" && !hasEventEnded(e, now.getTime()) && new Date(e.startTime).getTime() - CS_LEAD_MS <= now.getTime();
}

// The one-game display's pick, ranked the same way as the multi-game
// layouts (interest() in multiGame.ts: how big the event is, what's
// happening in it, followed teams):
//   1. only live events in a sport the display can render — "live" as the
//      dashboard counts it (isLiveNow): past its start time and not over
//      (a CS match from CS_LEAD_MS before it: isOnLiveDisplay),
//      even before the source flips its status (small PandaScore events
//      can sit at not_started long after they've begun)
//   2. highest interest first
//   3. sticky: the game already on screen keeps a margin, so two games of
//      about the same interest don't swap on every poll
// `arrivals`: games that have only just gone live, which get the same bonus
// as the one on screen for this pick, so a bigger new game can take over.
// A tie goes to the bigger event (importance: tier × stage, postseason),
// and between events the same size to the game that has been on longer.
// `hintsFor`: per-game hints from the display (InterestHints: one
// celebrating). A match between maps gives the screen to the best one being
// played, if there's one that can take it (canTakeOver), and gets it back as
// soon as its next map starts.
export function selectLiveEvent(
  events: NormalizedEvent[],
  currentKey: string | null,
  ranking?: Ranking,
  arrivals: Set<string> = new Set(),
  hintsFor: (key: string) => InterestHints = () => ({})
): NormalizedEvent | null {
  const now = new Date();
  const live = events.filter((e) => isOnLiveDisplay(e, now) && LIVE_VIEW_SPORTS.has(e.sport));
  if (live.length === 0) return null;
  const t = now.getTime();
  const score = (e: NormalizedEvent) =>
    interest(e, t, hintsFor(eventKey(e)), ranking) + (eventKey(e) === currentKey || arrivals.has(eventKey(e)) ? STAY_BONUS : 0);
  const sorted = [...live].sort(
    (a, b) => score(b) - score(a) || importance(b, ranking) - importance(a, ranking) || new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  // Single: the match on screen that has just finished keeps the screen for
  // its celebration (CELEBRATE_MS); any other that has finished is only
  // shown while nothing else is live
  const celebratingHere = sorted.find((e) => eventKey(e) === currentKey && hintsFor(eventKey(e)).celebrating);
  if (celebratingHere) return celebratingHere;
  const playingOn = sorted.filter((e) => !hintsFor(eventKey(e)).celebrating);
  const pool = playingOn.length ? playingOn : sorted;
  if (isOnBreak(pool[0], t)) {
    const playing = pool.find((e) => !isOnBreak(e, t) && canTakeOver(e, ranking));
    if (playing) return playing;
  }
  return pool[0];
}
