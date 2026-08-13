import type { NormalizedEvent } from "./types";

function toGCalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function googleCalendarUrl(e: NormalizedEvent): string {
  const start = new Date(e.startTime);
  // No reliable end time for most sources — default to a 2hr block, which
  // is close enough for a calendar reminder and easy to adjust in Google
  // Calendar's own editor before saving.
  const end = e.endTime ? new Date(e.endTime) : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const detailsLines = [e.league];
  if (e.teams && e.teams.length > 0) detailsLines.push(e.teams.map((t) => t.name).join(" vs "));
  if (e.streamUrl) detailsLines.push(`Stream: ${e.streamUrl}`);
  if (e.detailUrl) detailsLines.push(`More info: ${e.detailUrl}`);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.name,
    dates: `${toGCalDate(start)}/${toGCalDate(end)}`,
    details: detailsLines.join("\n"),
  });
  if (e.venue) params.set("location", e.venue);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
