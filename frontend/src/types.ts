export type Sport = string;
export type EventStatus = "live" | "upcoming" | "finished";

export interface NormalizedEvent {
  id: string;
  sport: Sport;
  league: string;
  name: string;
  startTime: string;
  status: EventStatus;
  detailUrl?: string;
  color?: string;
}

// Static meta for the two core (non-PandaScore) sources. Esports titles get
// their label/color from the backend's esportsCatalog instead, since that
// list is user-configurable.
export const CORE_SPORT_META: Record<string, { label: string; color: string }> = {
  nfl: { label: "NFL", color: "#3b82f6" },
  f1: { label: "F1", color: "#f97316" },
};

export const CUSTOM_FALLBACK_COLOR = "#94a3b8";
