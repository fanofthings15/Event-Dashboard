import { useEffect, useState } from "react";

// One shared ticking clock for all cards, kept entirely client-side so
// countdowns keep moving between data polls (which only happen every 60s or
// on manual resync) instead of freezing until the next fetch lands.
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatCountdown(startTime: string, now: Date): string {
  const diffMs = new Date(startTime).getTime() - now.getTime();
  if (diffMs <= 0) return "In progress";

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}
