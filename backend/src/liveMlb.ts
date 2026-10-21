import { cached } from "./cache.js";

// MLB's own Stats API (statsapi.mlb.com, free, no key) adds what ESPN lacks
// for the /live baseball view: the real ballpark's fence distances and every
// batted ball's landing spot, exit velocity and launch angle. Checked
// 2026-10-21 against a real game (Rays @ Guardians, gamePk 849817).

const API = "https://statsapi.mlb.com/api";

export interface Fence {
  venue: string;
  // Distances in feet at the left-field line, left, left-centre, centre,
  // right-centre and the right-field line (Stats API fieldInfo).
  leftLine: number;
  left: number;
  leftCenter: number;
  center: number;
  rightCenter: number;
  right?: number; // not every park reports it
  rightLine: number;
}

export interface Hit {
  id: string; // stable per batted ball
  x: number; // feet, home plate at the origin, + toward right field
  y: number; // feet, + toward centre field
  speed?: number; // exit velocity, mph
  angle?: number; // launch angle, degrees
  distance?: number; // feet
  trajectory?: string; // fly_ball, line_drive, ground_ball, popup
  result?: string; // e.g. "Single", "Home Run", "Flyout"
  out?: boolean; // the batted ball produced an out
  // Bases the ball was thrown to, in order, for outs made on a throw (an
  // assist then a putout at a base): ["1B"] on a routine groundout,
  // ["2B", "1B"] on a 6-4-3 double play. Empty for catches and unassisted outs.
  throws: BaseCode[];
  // Every runner on the play, batter included: where they started, where
  // they finished (or were put out), and whether they were out.
  runners: { from: BaseCode; to: BaseCode; out: boolean }[];
}

export type BaseCode = "home" | "1B" | "2B" | "3B";
const BASE_CODES: Record<string, BaseCode> = { "1B": "1B", "2B": "2B", "3B": "3B", score: "home", HP: "home", "4B": "home" };

// Stats API lists each runner's movement (sometimes in several pieces, e.g.
// advancing again on a throw) with fielding credits on the out. Runners are
// listed lead runner first, which is also the order a double play's throws
// happen in.
function motionFor(play: any): Pick<Hit, "out" | "throws" | "runners"> {
  const byRunner = new Map<number, { from: BaseCode; to: BaseCode; out: boolean }>();
  const throws: BaseCode[] = [];
  let out = false;
  for (const r of play.runners ?? []) {
    const m = r.movement ?? {};
    const id = r.details?.runner?.id ?? Math.random();
    const prev = byRunner.get(id);
    const from = prev?.from ?? (m.start ? BASE_CODES[m.start] : "home") ?? "home";
    const outAt = m.isOut ? BASE_CODES[m.outBase] : undefined;
    const to = outAt ?? (m.end ? BASE_CODES[m.end] : undefined) ?? prev?.to ?? from;
    byRunner.set(id, { from, to, out: Boolean(prev?.out || m.isOut) });
    if (m.isOut) {
      out = true;
      const credits: any[] = r.credits ?? [];
      if (outAt && credits.some((c) => c.credit === "f_assist") && credits.some((c) => c.credit === "f_putout") && throws.at(-1) !== outAt) throws.push(outAt);
    }
  }
  return { out, throws, runners: [...byRunner.values()].filter((r) => r.from !== r.to || r.out) };
}

const getJson = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} responded ${r.status}`);
  return r.json();
};

// Stats API schedule dates are US-local, so look the game up on the date it
// started in New York, then the day before (late West Coast games).
async function findGamePk(startIso: string, away: string, home: string): Promise<number | null> {
  const start = new Date(startIso);
  for (const offsetDays of [0, -1, 1]) {
    const d = new Date(start.getTime() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const sched: any = await cached(`mlb:sched:${d}`, 300, () => getJson(`${API}/v1/schedule?sportId=1&date=${d}`));
    for (const g of sched.dates?.[0]?.games ?? []) {
      if (g.teams?.away?.team?.name === away && g.teams?.home?.team?.name === home) return g.gamePk;
    }
  }
  return null;
}

const DEFAULT_FENCE = { leftLine: 330, left: 370, leftCenter: 385, center: 400, rightCenter: 385, rightLine: 330 };

async function fenceFor(venueId: number, venueName: string): Promise<Fence> {
  const v: any = await cached(`mlb:venue:${venueId}`, 86400, () => getJson(`${API}/v1/venues/${venueId}?hydrate=fieldInfo`));
  const f = v.venues?.[0]?.fieldInfo ?? {};
  const pick = (k: keyof typeof DEFAULT_FENCE) => (typeof f[k] === "number" ? f[k] : DEFAULT_FENCE[k]);
  return {
    venue: venueName,
    leftLine: pick("leftLine"),
    left: pick("left"),
    leftCenter: pick("leftCenter"),
    center: pick("center"),
    rightCenter: pick("rightCenter"),
    right: typeof f.right === "number" ? f.right : undefined,
    rightLine: pick("rightLine"),
  };
}

// Gameday hit coordinates are pixels on a 250×250 field image. The usual
// conversion (home plate at (125.42, 198.27), 2.5 ft per pixel) checks out
// against the API's own totalDistance: a 386 ft line drive lands at 387 ft.
const toFeet = (c: { coordX: number; coordY: number }) => ({ x: 2.5 * (c.coordX - 125.42), y: 2.5 * (198.27 - c.coordY) });

export async function mlbExtras(startIso: string, away: string, home: string): Promise<{ fence?: Fence; hits: Hit[] }> {
  const gamePk = await cached(`mlb:pk:${startIso}:${away}:${home}`, 3600, () => findGamePk(startIso, away, home));
  if (!gamePk) return { hits: [] };
  const feed: any = await cached(`mlb:feed:${gamePk}`, 5, () => getJson(`${API}/v1.1/game/${gamePk}/feed/live`));
  const venue = feed.gameData?.venue;
  const fence = venue?.id ? await fenceFor(venue.id, venue.name ?? "") : undefined;
  const hits: Hit[] = [];
  for (const play of feed.liveData?.plays?.allPlays ?? []) {
    for (const ev of play.playEvents ?? []) {
      const h = ev.hitData;
      if (!h?.coordinates || typeof h.coordinates.coordX !== "number") continue;
      hits.push({
        id: `${play.atBatIndex}-${ev.index}`,
        ...toFeet(h.coordinates),
        speed: h.launchSpeed,
        angle: h.launchAngle,
        distance: h.totalDistance,
        trajectory: h.trajectory,
        result: play.result?.event,
        ...motionFor(play),
      });
    }
  }
  return { fence, hits };
}
