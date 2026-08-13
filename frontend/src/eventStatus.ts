import type { NormalizedEvent } from "./types";

// The backend only knows an event's status as of its last poll (up to 60s
// stale). Once the local clock passes an event's start time, treat it as
// live immediately rather than waiting for the next fetch to confirm it.
export function isLiveNow(e: NormalizedEvent, now: Date): boolean {
  if (e.status === "live") return true;
  if (e.status === "finished") return false;
  return new Date(e.startTime).getTime() <= now.getTime();
}
