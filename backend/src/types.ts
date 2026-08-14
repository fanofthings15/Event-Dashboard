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
  durationMinutes?: number; // known exact duration, e.g. custom events — distinct from endTime, which is for multi-day date-range display
  status: EventStatus;
  detailUrl?: string;
  streamUrl?: string;
  venue?: string;
  teams?: EventTeam[];
  seriesScore?: string;
  extra?: ExtraFact[];
  color?: string; // explicit override, used by custom events
  followed?: boolean; // a team the user follows is competing in this event
  manuallyFollowed?: boolean; // this specific event was followed one-off (detail view button, or a custom event the user added) — shown as a distinct tag from the team-based "followed" badge
  region?: string; // state/province code, e.g. "MI" — currently FRC only
  liveDetail?: string; // in-progress game clock/period, e.g. "Q3 8:42" — only set while live, when the source provides it
}
