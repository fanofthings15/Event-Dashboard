import { useEffect, useState } from "react";

// Quiet hours: on this device, the Live display shows one game, and nothing
// on it makes a sound (streams forced muted and their players not clickable,
// no notification chime, the Streams tab's main tile muted). Per device like
// the Live layout — a TV at home and a laptop at work keep different hours.
// Local hours, [start, end), wrapping past midnight when end < start.
const QUIET_KEY = "live-quiet-hours";

export interface QuietHours {
  on: boolean;
  start: number;
  end: number;
}

const QUIET_DEFAULT: QuietHours = { on: true, start: 6, end: 12 };

export function loadQuiet(): QuietHours {
  try {
    const v = JSON.parse(localStorage.getItem(QUIET_KEY) ?? "null");
    if (v && typeof v.on === "boolean" && Number.isInteger(v.start) && Number.isInteger(v.end)) return v;
  } catch {
    /* fall through */
  }
  return QUIET_DEFAULT;
}

export function saveQuiet(q: QuietHours): void {
  try {
    localStorage.setItem(QUIET_KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable: lasts this visit */
  }
}

// Whether it's quiet hours right now, in the dashboard's timezone setting
// (or the device's own clock).
export function isQuietNow(q: QuietHours, timezone: string): boolean {
  if (!q.on || q.start === q.end) return false;
  let h = new Date().getHours();
  try {
    if (timezone) h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date()));
  } catch {
    /* unknown zone: the device's clock */
  }
  return q.start < q.end ? h >= q.start && h < q.end : h >= q.start || h < q.end;
}

// Re-checked every minute.
export function useQuietHours(q: QuietHours, timezone: string): boolean {
  const check = () => isQuietNow(q, timezone);
  const [quiet, setQuiet] = useState(check);
  useEffect(() => {
    setQuiet(check());
    const id = setInterval(() => setQuiet(check()), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.on, q.start, q.end, timezone]);
  return quiet;
}

