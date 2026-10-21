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
      });
    }
  }
  return { fence, hits };
}
