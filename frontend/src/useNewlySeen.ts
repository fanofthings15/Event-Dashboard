import { useEffect, useRef, useState } from "react";
import type { NormalizedEvent } from "./types";

const STORAGE_KEY = "event-dashboard-seen-events";
const MAX_STORED = 1500;

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(keys: Set<string>) {
  try {
    // Cap size so this doesn't grow forever — keep the most recently added.
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys].slice(-MAX_STORED)));
  } catch {
    // localStorage unavailable (private browsing, quota) — highlighting
    // just won't persist across visits, not worth failing over.
  }
}

// Returns the set of "sport-id" keys that are new since the last time this
// browser saw them — either from a previous visit (persisted) or added
// during the current session. Accumulates rather than replacing, so
// everything that showed up since page load stays flagged until reload.
export function useNewlySeen(events: NormalizedEvent[]): Set<string> {
  const seenRef = useRef<Set<string>>(loadSeen());
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fresh = events.map((e) => `${e.sport}-${e.id}`).filter((k) => !seenRef.current.has(k));
    if (fresh.length === 0) return;
    for (const k of fresh) seenRef.current.add(k);
    saveSeen(seenRef.current);
    setNewKeys((prev) => {
      const next = new Set(prev);
      for (const k of fresh) next.add(k);
      return next;
    });
  }, [events]);

  return newKeys;
}
