// Every formatter here accepts an optional IANA timezone (from
// settings.timezone) — an empty string/undefined means "use the browser's
// local timezone," matching Intl's own default behavior when the option is
// omitted entirely.

function tzOption(timezone: string | undefined): { timeZone: string } | Record<string, never> {
  return timezone ? { timeZone: timezone } : {};
}

export function formatEventTime(iso: string, timezone?: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...tzOption(timezone),
  });
}

export function formatEventDate(iso: string, timezone?: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...tzOption(timezone),
  });
}

export function formatEventClock(iso: string, timezone?: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...tzOption(timezone),
  });
}

// Common IANA zones for the settings dropdown — not exhaustive, just the
// ones someone's actually likely to want. "" means "use my browser's zone."
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "", label: "Local (browser default)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "UK (London)" },
  { value: "Europe/Paris", label: "Central Europe (Paris)" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Shanghai", label: "China (Shanghai)" },
  { value: "Asia/Tokyo", label: "Japan (Tokyo)" },
  { value: "Asia/Seoul", label: "Korea (Seoul)" },
  { value: "Australia/Sydney", label: "Sydney" },
];
