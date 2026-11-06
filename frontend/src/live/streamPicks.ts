import { useSyncExternalStore } from "react";

// The stream picked in the switcher for each game, per device (like pins
// and the layout), keyed by eventKey → the source's link. Dropped once the
// game is no longer live. A game without a pick plays the backend's first
// choice (English, then official, then YouTube > Kick > Twitch).

const KEY = "live-stream-pick";
type Picks = Record<string, string>;

function load(): Picks {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

let picks: Picks = load();
const subs = new Set<() => void>();

function commit(next: Picks) {
  picks = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private window or storage full: the pick still holds until a reload
  }
  for (const f of subs) f();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useStreamPicks(): Picks {
  return useSyncExternalStore(subscribe, () => picks);
}

export function setStreamPick(key: string, url: string | undefined) {
  if (picks[key] === url) return;
  const next = { ...picks };
  if (url) next[key] = url;
  else delete next[key];
  commit(next);
}

export function pruneStreamPicks(live: Set<string>) {
  const stale = Object.keys(picks).filter((k) => !live.has(k));
  if (!stale.length) return;
  const next = { ...picks };
  for (const k of stale) delete next[k];
  commit(next);
}
