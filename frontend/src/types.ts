export type Sport = string;
export type EventStatus = "live" | "upcoming" | "finished";

export interface EventTeam {
  name: string;
  imageUrl?: string;
  record?: string;
}

export interface ExtraFact {
  label: string;
  value: string;
}

export interface NormalizedEvent {
  id: string;
  sport: Sport;
  league: string;
  name: string;
  startTime: string;
  endTime?: string; // multi-day events (e.g. FRC) — omitted for single-day events
  status: EventStatus;
  detailUrl?: string;
  streamUrl?: string;
  venue?: string;
  teams?: EventTeam[];
  seriesScore?: string; // e.g. "Bo3 — 1-0" for a best-of-N match
  extra?: ExtraFact[];
  color?: string;
  followed?: boolean;
  region?: string; // state/province code, e.g. "MI" — currently FRC only
}

// Static meta for the core (non-PandaScore) sources. Esports titles get
// their label/color from the backend's esportsCatalog instead, since that
// list is user-configurable.
export const CORE_SPORT_META: Record<string, { label: string; color: string }> = {
  f1: { label: "F1", color: "#ef4444" }, // 0°
  nba: { label: "NBA", color: "#f97316" }, // 30°
  nhl: { label: "NHL", color: "#14b8a6" }, // 180°
  nfl: { label: "NFL", color: "#3b82f6" }, // 240°
  frc: { label: "FRC", color: "#8b5cf6" }, // 270°
};

export const CUSTOM_FALLBACK_COLOR = "#94a3b8";

// Liquipedia subdomain per esports sport key, used as a fallback "more info"
// link when a source (PandaScore in particular) gives us no match page URL.
export const LIQUIPEDIA_WIKI: Record<string, string> = {
  cs2: "counterstrike",
  lol: "leagueoflegends",
  "rocket-league": "rocketleague",
  valorant: "valorant",
  overwatch: "overwatch",
  dota2: "dota2",
  r6siege: "rainbowsix",
};

export function liquipediaSearchUrl(sport: string, query: string): string | undefined {
  const wiki = LIQUIPEDIA_WIKI[sport];
  if (!wiki) return undefined;
  return `https://liquipedia.net/${wiki}/index.php?search=${encodeURIComponent(query)}`;
}
