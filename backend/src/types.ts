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
  name: string; // e.g. "Chiefs vs Bills" or "Monaco Grand Prix"
  startTime: string; // ISO 8601
  endTime?: string; // multi-day events (e.g. FRC) — omitted for single-day events
  status: EventStatus;
  detailUrl?: string;
  streamUrl?: string;
  venue?: string;
  teams?: EventTeam[];
  seriesScore?: string;
  extra?: ExtraFact[];
  color?: string; // explicit override, used by custom events
  followed?: boolean; // a team the user follows is competing in this event
  region?: string; // state/province code, e.g. "MI" — currently FRC only
}
