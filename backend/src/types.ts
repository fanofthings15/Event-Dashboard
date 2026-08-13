export type Sport = string;
export type EventStatus = "live" | "upcoming" | "finished";

export interface NormalizedEvent {
  id: string;
  sport: Sport;
  league: string;
  name: string; // e.g. "Chiefs vs Bills" or "Monaco Grand Prix"
  startTime: string; // ISO 8601
  status: EventStatus;
  detailUrl?: string;
  color?: string; // explicit override, used by custom events
}
