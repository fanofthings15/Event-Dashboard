import type { NormalizedEvent } from "../types";
import { ESPORTS_SPORTS, eventKey } from "./selectLiveEvent";

// Several live games on one screen. Two arrangements:
//   "redzone": the most interesting game big, up to three beside it
//   "grid":    equal tiles, up to six
// plus "single" (the one-game display). The games shown are picked by how
// interesting they are right now, except where the user has pinned a game to
// a spot (tap or drag) or hidden it (drag to the strip).

export type LiveLayout = "redzone" | "grid" | "single";

export interface MultiPrefs {
  pins: Record<string, number>; // event key -> slot index
  hidden: string[];
}

// ---------- interest ----------

function margin(e: NormalizedEvent): number | undefined {
  const m = e.seriesScore?.match(/^(\d+)-(\d+)$/);
  return m ? Math.abs(Number(m[1]) - Number(m[2])) : undefined;
}

// Period number from ESPN's short detail: "0:52 - 4th", "End of 3rd",
// "Top 7th", "OT" (counted as after regulation).
function period(e: NormalizedEvent): number | undefined {
  const d = e.liveDetail ?? "";
  if (/\bOT\b|overtime|shootout/i.test(d)) return 99;
  const m = d.match(/(\d+)(st|nd|rd|th)/i);
  return m ? Number(m[1]) : undefined;
}

// Seconds left on the clock, from "4:10 - 4th".
function clockSeconds(e: NormalizedEvent): number | undefined {
  const m = e.liveDetail?.match(/^(\d+):(\d+)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

export interface InterestHints {
  scoredAt?: number; // last time the score changed, ms
  powerPlay?: boolean; // hockey, from the tile's own live data
}

// Higher = more worth watching right now. Red zone beats a fresh score beats
// a power play beats a close finish beats a followed team; late blowouts sink.
export function interest(e: NormalizedEvent, now: number, hints: InterestHints = {}): number {
  let score = 0;
  if (e.manuallyFollowed) score += 35;
  else if (e.followed) score += 30;
  if (e.situation?.redZone) score += 100;
  if (hints.scoredAt && now - hints.scoredAt < 3 * 60_000) score += 80;
  if (hints.powerPlay) score += 70;

  const diff = margin(e);
  const p = period(e);
  const clock = clockSeconds(e);
  if (diff !== undefined && p !== undefined) {
    switch (e.sport) {
      case "nfl":
      case "ncaaf":
        if (p >= 4 && diff <= 8) score += 60;
        else if (p >= 4 && diff >= 17) score -= 30;
        break;
      case "nba":
        if (p >= 4 && diff <= 6 && (clock === undefined || clock <= 300 || p === 99)) score += 60;
        else if (p >= 4 && diff >= 20) score -= 30;
        break;
      case "nhl":
        if (p >= 3 && diff <= 1) score += clock !== undefined && clock <= 300 ? 65 : 55;
        else if (p >= 3 && diff >= 3) score -= 30;
        break;
      case "mlb":
        if (p >= 8 && diff <= 2) score += 50;
        else if (p >= 8 && diff >= 6) score -= 30;
        break;
    }
    score -= Math.min(diff, 30) * 0.5; // closer games edge ahead
  }
  if (ESPORTS_SPORTS.has(e.sport)) {
    // a deciding map: "2-2 (Bo5)"
    const w = e.seriesScore?.match(/(\d+)-(\d+)/);
    const bo = e.seriesScore?.match(/Bo(\d+)/i);
    if (w && bo && w[1] === w[2] && Number(w[1]) === Math.floor(Number(bo[1]) / 2)) score += 40;
  }
  return score;
}

// ---------- placement ----------

export function capacity(layout: LiveLayout, count: number): number {
  if (layout === "single") return Math.min(1, count);
  if (layout === "redzone") return Math.min(4, count);
  return Math.min(6, count);
}

// A game already on screen gets this much extra, so two games of about the
// same interest don't swap places on every poll.
const STAY_BONUS = 15;

export function placeGames(
  live: NormalizedEvent[],
  scores: Map<string, number>,
  prev: string[],
  prefs: MultiPrefs,
  layout: LiveLayout
): { slots: string[]; strip: string[] } {
  const hidden = new Set(prefs.hidden);
  const visible = live.filter((e) => !hidden.has(eventKey(e)));
  const n = capacity(layout, visible.length);
  const slots: (string | null)[] = Array(n).fill(null);

  // pinned games keep their spot (or the nearest free one if the layout shrank)
  const pinnedKeys = visible.map(eventKey).filter((k) => prefs.pins[k] !== undefined).sort((a, b) => prefs.pins[a] - prefs.pins[b]);
  for (const k of pinnedKeys) {
    const want = Math.min(prefs.pins[k], n - 1);
    const at = slots[want] === null ? want : slots.indexOf(null);
    if (at >= 0) slots[at] = k;
  }

  const rank = (k: string) => (scores.get(k) ?? 0) + (prev.includes(k) ? STAY_BONUS : 0);
  const free = slots.filter((s) => s === null).length;
  const chosen = visible
    .map(eventKey)
    .filter((k) => !slots.includes(k))
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, free);

  // RedZone: the big spot always goes to the most interesting unpinned game
  if (layout === "redzone" && slots[0] === null && chosen.length > 0) slots[0] = chosen.shift()!;
  // everything else stays where it was if that spot is still free...
  for (const k of [...chosen]) {
    const was = prev.indexOf(k);
    if (was >= 0 && was < n && slots[was] === null && !(layout === "redzone" && was === 0)) {
      slots[was] = k;
      chosen.splice(chosen.indexOf(k), 1);
    }
  }
  // ...and new arrivals fill the gaps in order of interest
  for (const k of chosen) slots[slots.indexOf(null)] = k;

  const shown = new Set(slots);
  const strip = live
    .map(eventKey)
    .filter((k) => !shown.has(k))
    .sort((a, b) => Number(hidden.has(a)) - Number(hidden.has(b)) || (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
  return { slots: slots.filter((s): s is string => s !== null), strip };
}

// ---------- user choices ----------

export const tapToBig = (prefs: MultiPrefs, key: string): MultiPrefs => {
  const pins = Object.fromEntries(Object.entries(prefs.pins).filter(([k, slot]) => k !== key && slot !== 0));
  return { pins: { ...pins, [key]: 0 }, hidden: prefs.hidden.filter((h) => h !== key) };
};

// A game dropped on a spot takes it, pinned. From another spot it's a swap
// (both stay pinned); from the strip, the game it replaces is unpinned and
// goes back to being placed by interest.
export const dropOnSlot = (prefs: MultiPrefs, key: string, slot: number, slots: string[]): MultiPrefs => {
  const occupant = slots[slot];
  const from = slots.indexOf(key);
  const pins = { ...prefs.pins, [key]: slot };
  if (occupant && occupant !== key) {
    if (from >= 0) pins[occupant] = from;
    else delete pins[occupant];
  }
  return { pins, hidden: prefs.hidden.filter((h) => h !== key) };
};

export const hideGame = (prefs: MultiPrefs, key: string): MultiPrefs => {
  const pins = { ...prefs.pins };
  delete pins[key];
  return { pins, hidden: prefs.hidden.includes(key) ? prefs.hidden : [...prefs.hidden, key] };
};

export const unpinGame = (prefs: MultiPrefs, key: string): MultiPrefs => {
  const pins = { ...prefs.pins };
  delete pins[key];
  return { ...prefs, pins };
};

// Pins and hidden games only matter while those games are live.
export const pruneTo = (prefs: MultiPrefs, liveKeys: Set<string>): MultiPrefs => ({
  pins: Object.fromEntries(Object.entries(prefs.pins).filter(([k]) => liveKeys.has(k))),
  hidden: prefs.hidden.filter((k) => liveKeys.has(k)),
});

// ---------- per-device storage ----------
// Which layout and which games are pinned/hidden belong to the screen
// they're set on (a TV and a phone want different things), so they live in
// this browser's storage, not the shared settings.

const LAYOUT_KEY = "live-layout";
const PREFS_KEY = "live-multi-prefs";

export function loadLayout(): LiveLayout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === "grid" || v === "single" || v === "redzone" ? v : "redzone";
  } catch {
    return "redzone";
  }
}

export function saveLayout(layout: LiveLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    /* storage unavailable: the choice just lasts this visit */
  }
}

export function loadPrefs(): MultiPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (v && typeof v.pins === "object" && Array.isArray(v.hidden)) return v;
  } catch {
    /* fall through */
  }
  return { pins: {}, hidden: [] };
}

export function savePrefs(prefs: MultiPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

// grid-template-areas for n tiles; every tile keeps one stable element and
// just moves between areas, so a stream isn't reloaded when its game moves.
export function multiTemplate(layout: LiveLayout, n: number, portrait: boolean): { areas: string; columns: string; className: string } {
  const a = (rows: string[]) => rows.map((r) => `"${r}"`).join(" ");
  // everything else hidden: the one game left fills the screen
  if (n <= 1) return { areas: a(["s0"]), columns: "minmax(0,1fr)", className: "one" };
  if (portrait) {
    if (n <= 2) return { areas: a(["s0", "s1"]), columns: "minmax(0,1fr)", className: "p2" };
    const rows: string[] = layout === "redzone" ? ["s0 s0"] : [];
    const rest = Array.from({ length: n }, (_, i) => `s${i}`).slice(layout === "redzone" ? 1 : 0);
    for (let i = 0; i < rest.length; i += 2) rows.push(`${rest[i]} ${rest[i + 1] ?? "."}`);
    return { areas: a(rows), columns: "repeat(2, minmax(0,1fr))", className: "pn" };
  }
  if (layout === "redzone") {
    if (n === 2) return { areas: a(["s0 s1"]), columns: "minmax(0,3fr) minmax(0,2fr)", className: "rz2" };
    const rows = Array.from({ length: n - 1 }, (_, i) => `s0 s${i + 1}`);
    return { areas: a(rows), columns: "minmax(0,2.25fr) minmax(0,1fr)", className: "rz" };
  }
  switch (n) {
    case 2:
      return { areas: a(["s0 s1"]), columns: "repeat(2, minmax(0,1fr))", className: "g2" };
    case 3:
      return { areas: a(["s0 s0 s1 s1", ". s2 s2 ."]), columns: "repeat(4, minmax(0,1fr))", className: "g" };
    case 4:
      return { areas: a(["s0 s1", "s2 s3"]), columns: "repeat(2, minmax(0,1fr))", className: "g" };
    case 5:
      return { areas: a(["s0 s0 s1 s1 s2 s2", ". s3 s3 s4 s4 ."]), columns: "repeat(6, minmax(0,1fr))", className: "g" };
    default:
      return { areas: a(["s0 s1 s2", "s3 s4 s5"]), columns: "repeat(3, minmax(0,1fr))", className: "g" };
  }
}
