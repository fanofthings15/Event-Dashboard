import type { NormalizedEvent } from "./types";
import type { StreamSlot } from "./settingsTypes";

// Only PandaScore esports matches carry a real, distinct broadcast link
// (streamUrl differs from detailUrl, which points at the league's wiki
// page instead) — ESPN-sourced sports set both to the same gamecast page
// (a stats page, not a video), and F1/FRC/custom events don't set
// streamUrl at all. This is what tells a genuine watchable stream apart
// from "just a link" without hardcoding a per-sport list.
export function hasWatchableStream(event: Pick<NormalizedEvent, "streamUrl" | "detailUrl">): boolean {
  return Boolean(event.streamUrl && event.streamUrl !== event.detailUrl);
}

// How early a followed event's stream joins the Streams tab before its
// projected start. Earlier than this, following it only follows it — the
// stream is added automatically once the window opens (App.tsx).
export const PRESTART_WINDOW_MS = 5 * 60 * 1000;

export function isWithinStreamWindow(event: Pick<NormalizedEvent, "status" | "startTime">, nowMs: number): boolean {
  if (event.status === "live") return true;
  return new Date(event.startTime).getTime() - nowMs <= PRESTART_WINDOW_MS;
}

export function eventStreamSlotId(event: Pick<NormalizedEvent, "sport" | "id">): string {
  return `event:${event.sport}-${event.id}`;
}

export function withEventStreamSlot(slots: StreamSlot[], event: Pick<NormalizedEvent, "sport" | "id" | "name">, url: string): StreamSlot[] {
  const id = eventStreamSlotId(event);
  const existing = slots.find((s) => s.id === id);
  if (existing) return slots.map((s) => (s.id === id ? { ...s, label: event.name, url } : s));
  return [...slots, { id, label: event.name, url }];
}

export function withoutEventStreamSlot(
  slots: StreamSlot[],
  mainId: string | null,
  event: Pick<NormalizedEvent, "sport" | "id">
): { slots: StreamSlot[]; mainId: string | null } {
  const id = eventStreamSlotId(event);
  const nextSlots = slots.filter((s) => s.id !== id);
  const nextMain = mainId === id ? (nextSlots[0]?.id ?? null) : mainId;
  return { slots: nextSlots, mainId: nextMain };
}
