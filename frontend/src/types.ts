export type Sport = "nfl" | "f1" | "cs2" | "lol" | "rocket-league";
export type EventStatus = "live" | "upcoming" | "finished";

export interface NormalizedEvent {
  id: string;
  sport: Sport;
  league: string;
  name: string;
  startTime: string;
  status: EventStatus;
  detailUrl?: string;
}

export const SPORT_LABEL: Record<Sport, string> = {
  nfl: "NFL",
  f1: "F1",
  cs2: "Counter-Strike 2",
  lol: "League of Legends",
  "rocket-league": "Rocket League",
};
