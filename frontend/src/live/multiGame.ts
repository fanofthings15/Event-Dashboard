import type { NormalizedEvent } from "../types";
import { ESPORTS_SPORTS, eventKey } from "./selectLiveEvent";
import { embeddableStream } from "./Stream";

// Several live games on one screen. Two arrangements:
//   "redzone": the most interesting game big, up to three beside it
//   "grid":    equal tiles, up to six
// plus "single" (the one-game display). The games shown are picked by how
// interesting they are right now, except where the user has pinned a game to
// a spot (tap or drag) or hidden it (drag to the strip).

export type LiveLayout = "redzone" | "grid" | "single";
// What the screen is set to: a layout, or "auto" (autoLayout picks one).
export type LayoutChoice = LiveLayout | "auto";

export interface MultiPrefs {
  pins: Record<string, number>; // event key -> slot index
  hidden: string[];
  // replaced by a game dropped onto its spot: ranked last, so it goes to the
  // strip rather than bumping some other game, but still fills a free spot
  benched?: string[];
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

// How big the event is, before anything happens in it: a Worlds or Major
// match or a playoff game outranks an NFL Sunday or a tier-A esports event,
// which outrank a regular NBA/NHL/MLB night, and so on down to tier-D
// esports, with FRC last of all — still shown when nothing bigger is on (the
// sources the user doesn't want are filtered out in settings, not here).
export function importance(e: NormalizedEvent): number {
  if (ESPORTS_SPORTS.has(e.sport)) {
    // the stage matters inside a tier: an NFL red-zone drive (55 + 35)
    // outranks a Major's Swiss/group map but not its playoffs or final
    const byStage = {
      s: { group: 75, playoffs: 90, semifinal: 100, final: 110 },
      a: { group: 50, playoffs: 55, semifinal: 60, final: 70 },
      b: { group: 20, playoffs: 25, semifinal: 30, final: 35 },
      c: { group: 8, playoffs: 10, semifinal: 12, final: 15 },
      d: { group: 0, playoffs: 0, semifinal: 3, final: 5 },
    }[e.tier ?? "c"];
    return e.stage ? byStage[e.stage] : byStage.playoffs;
  }
  if (e.postseason) return 90;
  switch (e.sport) {
    case "nfl":
    case "f1":
      return 55;
    case "nba":
    case "nhl":
    case "mlb":
    case "ncaaf":
      return 40;
    case "frc":
      // lowest of all, followed team or not: the user is usually at the
      // event in person, or only cares who wins it, not every match
      return -10;
  }
  return 10;
}

// The most a moment in the game can add (red zone, a fresh score, a close
// finish). Event levels a step apart (40 vs 55) can swap on a big moment,
// but nothing passes an event 35+ bigger: an NFL red-zone drive (55 + 35)
// only draws level with a Worlds or Major match (90), which then keeps its
// spot through the on-screen bonus.
const MOMENT_CAP = 35;

// What's happening in the game right now, 0..MOMENT_CAP — the strongest one
// counts, they don't stack.
function moment(e: NormalizedEvent, now: number, hints: InterestHints): number {
  let m = 0;
  if (e.situation?.redZone) m = Math.max(m, 35);
  if (hints.scoredAt && now - hints.scoredAt < 3 * 60_000) m = Math.max(m, 32);
  if (hints.powerPlay) m = Math.max(m, 28);
  const diff = margin(e);
  const p = period(e);
  const clock = clockSeconds(e);
  if (diff !== undefined && p !== undefined) {
    switch (e.sport) {
      case "nfl":
      case "ncaaf":
        if (p >= 4 && diff <= 8) m = Math.max(m, 30);
        break;
      case "nba":
        if (p >= 4 && diff <= 6 && (clock === undefined || clock <= 300 || p === 99)) m = Math.max(m, 30);
        break;
      case "nhl":
        if (p >= 3 && diff <= 1) m = Math.max(m, clock !== undefined && clock <= 300 ? 32 : 25);
        break;
      case "mlb":
        if (p >= 8 && diff <= 2) m = Math.max(m, 25);
        break;
    }
  }
  if (ESPORTS_SPORTS.has(e.sport)) {
    // a deciding map: "2-2 (Bo5)", "1-1 (Bo3)" — a Bo1 doesn't count
    const w = e.seriesScore?.match(/(\d+)-(\d+)/);
    const bo = e.seriesScore?.match(/Bo(\d+)/i);
    if (w && bo && w[1] === w[2] && Number(bo[1]) > 1 && Number(w[1]) === Math.floor(Number(bo[1]) / 2)) m = Math.max(m, 25);
  }
  return Math.min(m, MOMENT_CAP);
}

// A match whose stream plays right here (esports) — the display is often the
// only place it's being watched, while a big football game is usually on its
// own broadcast elsewhere — so among equals it gets the spot, and in RedZone
// the big one with the sound.
const WATCHABLE_HERE = 10;

// A game's worth before anything happens in it: event size, a followed
// team, a stream that plays here. Steady for the whole game, so the Auto
// layout (which uses it) only changes when games start or end, not on every
// red-zone trip.
function standing(e: NormalizedEvent): number {
  let s = importance(e);
  if (e.sport === "frc") return s; // no follow bonus either (see importance)
  if (ESPORTS_SPORTS.has(e.sport) && embeddableStream((e.streams ?? []).map((x) => x.url).concat(e.streamUrl ?? []))) s += WATCHABLE_HERE;
  if (e.manuallyFollowed) s += 35;
  else if (e.followed) s += 30;
  return s;
}

// The smallest events (tier-D esports, any FRC event) are welcome when
// nothing better is on, but not beside a big game (NFL / tier-A esports and
// up): then they wait in the strip, unless pinned.
const BIG = 55;
const MINOR = 5;
export function spotEligible(live: NormalizedEvent[]): NormalizedEvent[] {
  if (!live.some((e) => standing(e) >= BIG)) return live;
  return live.filter((e) => importance(e) > MINOR);
}

// The Auto layout, from how the live games that can take a spot compare:
//   single  — one game, or the top one is 35+ ahead of the next (a Major
//             final against regular-season hockey)
//   grid    — four or more games within 10 of the top (an NFL Sunday, a
//             full NHL night)
//   redzone — otherwise: one standout and some smaller games
export function autoLayout(live: NormalizedEvent[]): LiveLayout {
  const games = spotEligible(live);
  if (games.length <= 1) return "single";
  const s = games.map(standing).sort((a, b) => b - a);
  if (s[0] - s[1] >= 35) return "single";
  if (s.filter((x) => x >= s[0] - 10).length >= 4) return "grid";
  return "redzone";
}

// Higher = more worth watching right now: how big the event is, plus what's
// happening in it, plus a team the user follows, plus a stream that plays here. A late blowout sinks a
// little, and among equals the closer game edges ahead.
export function interest(e: NormalizedEvent, now: number, hints: InterestHints = {}): number {
  let score = standing(e) + moment(e, now, hints);
  const diff = margin(e);
  const p = period(e);
  if (diff !== undefined && p !== undefined) {
    const late = { nfl: 4, ncaaf: 4, nba: 4, nhl: 3, mlb: 8 }[e.sport as "nfl"];
    const blowout = { nfl: 17, ncaaf: 17, nba: 20, nhl: 3, mlb: 6 }[e.sport as "nfl"];
    if (late && p >= late && diff >= blowout) score -= 20;
    score -= Math.min(diff, 30) * 0.2;
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
export const STAY_BONUS = 15;

export function placeGames(
  live: NormalizedEvent[],
  scores: Map<string, number>,
  prev: string[],
  prefs: MultiPrefs,
  layout: LiveLayout
): { slots: string[]; strip: string[] } {
  const hidden = new Set(prefs.hidden);
  const visible = live.filter((e) => !hidden.has(eventKey(e)));
  // tier-D-sized games beside a big one only get a spot if pinned there
  const eligible = new Set(spotEligible(visible).map(eventKey));
  const n = capacity(layout, visible.filter((e) => eligible.has(eventKey(e)) || prefs.pins[eventKey(e)] !== undefined).length);
  const slots: (string | null)[] = Array(n).fill(null);

  // pinned games keep their spot (or the nearest free one if the layout shrank)
  const pinnedKeys = visible.map(eventKey).filter((k) => prefs.pins[k] !== undefined).sort((a, b) => prefs.pins[a] - prefs.pins[b]);
  for (const k of pinnedKeys) {
    const want = Math.min(prefs.pins[k], n - 1);
    const at = slots[want] === null ? want : slots.indexOf(null);
    if (at >= 0) slots[at] = k;
  }

  const benched = new Set(prefs.benched ?? []);
  const rank = (k: string) => (scores.get(k) ?? 0) + (prev.includes(k) ? STAY_BONUS : 0) - (benched.has(k) ? 10_000 : 0);
  const free = slots.filter((s) => s === null).length;
  const chosen = visible
    .map(eventKey)
    .filter((k) => !slots.includes(k) && eligible.has(k))
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

const without = (list: string[] | undefined, key: string) => (list ?? []).filter((k) => k !== key);

export const tapToBig = (prefs: MultiPrefs, key: string): MultiPrefs => {
  const pins = Object.fromEntries(Object.entries(prefs.pins).filter(([k, slot]) => k !== key && slot !== 0));
  return { pins: { ...pins, [key]: 0 }, hidden: without(prefs.hidden, key), benched: without(prefs.benched, key) };
};

// A game dropped on a spot takes it, pinned. From another spot it's a swap:
// the game it displaced isn't pinned — it drops into the spot just left
// (the only gap, since every other game keeps its place) and is ranked as
// usual from there. From the strip, the game it replaces goes to the strip
// (benched) and every other game stays where it is.
export const dropOnSlot = (prefs: MultiPrefs, key: string, slot: number, slots: string[]): MultiPrefs => {
  const occupant = slots[slot];
  const from = slots.indexOf(key);
  const pins = { ...prefs.pins, [key]: slot };
  let benched = without(prefs.benched, key);
  if (occupant && occupant !== key) {
    if (from >= 0) {
      delete pins[occupant];
      benched = without(benched, occupant);
    } else {
      delete pins[occupant];
      benched = [...without(benched, occupant), occupant];
    }
  }
  return { pins, hidden: without(prefs.hidden, key), benched };
};

export const hideGame = (prefs: MultiPrefs, key: string): MultiPrefs => {
  const pins = { ...prefs.pins };
  delete pins[key];
  return { pins, hidden: prefs.hidden.includes(key) ? prefs.hidden : [...prefs.hidden, key], benched: without(prefs.benched, key) };
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
  benched: (prefs.benched ?? []).filter((k) => liveKeys.has(k)),
});

// ---------- per-device storage ----------
// Which layout and which games are pinned/hidden belong to the screen
// they're set on (a TV and a phone want different things), so they live in
// this browser's storage, not the shared settings.

const LAYOUT_KEY = "live-layout";
const PREFS_KEY = "live-multi-prefs";

export function loadLayout(): LayoutChoice {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === "grid" || v === "single" || v === "redzone" || v === "auto" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function saveLayout(layout: LayoutChoice): void {
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
