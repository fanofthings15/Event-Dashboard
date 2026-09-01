import type { NormalizedEvent } from "./types";

// A source's own "live"/"running" status string can lag behind reality for
// a bit after something actually ends (seen in practice — a finished
// PandaScore esports match briefly still reporting "running" while its
// `end_at` was already in the past). Where an endTime is available, it wins
// over a stale status — shared by isLiveNow (the LIVE badge) and by
// App.tsx's stream auto-remove effect, so neither keeps calling something
// live once we independently know it's over.
export function hasEventEnded(e: Pick<NormalizedEvent, "status" | "endTime">, nowMs: number): boolean {
  if (e.endTime && new Date(e.endTime).getTime() <= nowMs) return true;
  return e.status === "finished";
}

// The backend only knows an event's status as of its last poll (up to 60s
// stale). Once the local clock passes an event's start time, treat it as
// live immediately rather than waiting for the next fetch to confirm it.
export function isLiveNow(e: NormalizedEvent, now: Date): boolean {
  if (hasEventEnded(e, now.getTime())) return false;
  if (e.status === "live") return true;
  return new Date(e.startTime).getTime() <= now.getTime();
}
