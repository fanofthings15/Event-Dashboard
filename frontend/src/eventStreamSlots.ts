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
