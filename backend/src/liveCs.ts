import { cache, cached } from "./cache.js";
import { curlGetJson } from "./espnScoreboard.js";

// Counter-Strike map scores and per-map player stats for /live, from
// bo3.gg's public JSON API (unofficial, no key — what bo3.gg's own pages
// load). PandaScore's free plan stops at "who won each map"; bo3.gg adds
// the map names, round scores and, once a map is finished, every player's
// numbers. It has no running round score for the map being played: that
// only fills in when the map ends (checked live 2026-10-31).
const API = "https://api.bo3.gg/api/v1";

export interface CsMvp {
  name: string; // the player's Steam name, which isn't always their pro tag
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
}

export interface CsMap {
  number: number;
  map: string; // "Ancient"
  score?: [number, number]; // rounds, in PandaScore's team order
  winner?: 0 | 1;
  live: boolean; // the map being played now
  mvps?: [CsMvp | null, CsMvp | null]; // best rated player per team, finished maps only
}

export interface CsMatchState {
  kind: "cs";
  maps: CsMap[];
}

// "Natus Vincere" / "natus-vincere" / "NAVI" — compared without case or punctuation
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const sameTeam = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x === y || x.includes(y) || y.includes(x));
};

const mapLabel = (m?: string) => {
  const s = (m ?? "").replace(/^de_/, "");
  return s ? s[0].toUpperCase() + s.slice(1) : "";
};

async function liveMatches(): Promise<any[]> {
  return cached("cs:bo3:current", 30, async () => {
    const q =
      "scope=widget-matches&page%5Blimit%5D=50&filter%5Bmatches.status%5D%5Bin%5D=current" +
      "&filter%5Bmatches.discipline_id%5D%5Beq%5D=1&with=teams,games";
    const d = await curlGetJson(`${API}/matches?${q}`);
    return d.results ?? [];
  });
}

// A finished map's stats never change, so they're kept for a day — but
// bo3.gg publishes them a while after the map ends (minutes for some
// matches, longer for others), and an empty answer is only kept 5 minutes.
async function mvps(gameId: number, teamIds: [number, number]): Promise<[CsMvp | null, CsMvp | null] | undefined> {
  const key = `cs:bo3:stats:${gameId}`;
  const hit = cache.get<[CsMvp | null, CsMvp | null] | null>(key);
  if (hit !== undefined) return hit ?? undefined;
  const players: any[] = await curlGetJson(`${API}/games/${gameId}/players_stats`);
  if (!Array.isArray(players) || players.length === 0) {
    cache.set(key, null, 300);
    return undefined;
  }
  {
    const best = (teamId: number): CsMvp | null => {
      const p = players.filter((x) => x.team_clan?.team_id === teamId).sort((a, b) => (b.player_rating ?? 0) - (a.player_rating ?? 0))[0];
      return p
        ? { name: p.steam_profile?.nickname ?? "?", kills: p.kills ?? 0, deaths: p.death ?? 0, assists: p.assists ?? 0, adr: Math.round(p.adr ?? 0) }
        : null;
    };
    const out: [CsMvp | null, CsMvp | null] = [best(teamIds[0]), best(teamIds[1])];
    cache.set(key, out, 86_400);
    return out;
  }
}

// The bo3.gg match for a live PandaScore one, matched by both team names
// (either order), with maps given in PandaScore's team order. null when
// bo3.gg doesn't cover the match.
export async function csMatchState(team1: string, team2: string): Promise<CsMatchState | null> {
  const matches = await liveMatches();
  let swapped = false;
  const m = matches.find((x) => {
    const a = x.team1?.name ?? "";
    const b = x.team2?.name ?? "";
    if (sameTeam(a, team1) && sameTeam(b, team2)) return true;
    if (sameTeam(a, team2) && sameTeam(b, team1)) return (swapped = true);
    return false;
  });
  if (!m) return null;
  const ids: [number, number] = swapped ? [m.team2_id, m.team1_id] : [m.team1_id, m.team2_id];
  const games = [...(m.games ?? [])].sort((a, b) => a.number - b.number);
  // the first picked map without a result is the one being played
  const liveNumber = games.find((g) => g.map_name && g.winner_team_clan?.team_id === undefined)?.number;

  const maps: CsMap[] = [];
  for (const g of games) {
    if (!g.map_name) continue; // not picked yet
    const winnerId = g.winner_team_clan?.team_id;
    const done = winnerId !== undefined && g.winner_clan_score != null;
    const winner = done ? (winnerId === ids[0] ? 0 : winnerId === ids[1] ? 1 : undefined) : undefined;
    const map: CsMap = { number: g.number, map: mapLabel(g.map_name), live: g.number === liveNumber };
    if (done && winner !== undefined) {
      map.winner = winner;
      map.score = winner === 0 ? [g.winner_clan_score, g.loser_clan_score] : [g.loser_clan_score, g.winner_clan_score];
      try {
        map.mvps = await mvps(g.id, ids);
      } catch {
        // stats not parsed yet or bo3.gg hiccup: the score still shows
      }
    }
    maps.push(map);
  }
  // A map under way before bo3.gg names it: shown as "Map 4", live.
  const played = (m.team1_score ?? 0) + (m.team2_score ?? 0);
  const decided = Math.max(m.team1_score ?? 0, m.team2_score ?? 0) > (m.bo_type ?? 1) / 2;
  if (!decided && !maps.some((x) => x.live) && played === maps.filter((x) => x.score).length) {
    const next = played + 1;
    if (!maps.some((x) => x.number === next)) maps.push({ number: next, map: `Map ${next}`, live: true });
    else maps.find((x) => x.number === next)!.live = true;
    maps.sort((a, b) => a.number - b.number);
  }
  return { kind: "cs", maps };
}
