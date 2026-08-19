import { Router } from "express";
import { cached } from "./cache.js";
import type { NormalizedEvent, ExtraFact, StandingsGroup, StandingsRow } from "./types.js";

// ESPN's site API sits behind Akamai bot protection that 403s Bun's (and
// Node's) fetch() based on TLS/HTTP client fingerprint alone — headers don't
// matter, curl from the same box gets a clean 200. Shelling out to curl
// works around it.
async function curlGetJson(url: string): Promise<any> {
  const proc = Bun.spawn(["curl", "-s", "--max-time", "10", "-w", "\n%{http_code}", url], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`curl failed (exit ${exitCode}): ${stderr.trim()}`);

  const splitAt = output.lastIndexOf("\n");
  const body = output.slice(0, splitAt);
  const status = Number(output.slice(splitAt + 1).trim());
  if (status < 200 || status >= 300) throw new Error(`ESPN responded ${status}`);
  return JSON.parse(body);
}

function mapStatus(state: string): NormalizedEvent["status"] {
  if (state === "in") return "live";
  if (state === "post") return "finished";
  return "upcoming";
}

// Order (and inclusion) of stat columns shown per standings row. Confirmed
// against a real NFL standings response — "ties" simply won't be found for
// NBA/NHL entries and is skipped there, same mechanism.
const STANDINGS_STAT_ORDER = ["wins", "losses", "ties", "winPercent", "gamesBehind", "streak"];

interface EspnStandingsNode {
  name: string;
  standings?: { entries?: any[] };
  children?: EspnStandingsNode[];
}

// ESPN's standings tree nests groups (conference, and possibly division)
// to a depth that isn't guaranteed consistent across sports/seasons — walk
// recursively for the first node carrying real entries rather than
// assuming a fixed depth.
function collectStandingsGroups(node: EspnStandingsNode): StandingsGroup[] {
  const entries = node.standings?.entries;
  if (entries && entries.length > 0) {
    return [{ name: node.name, rows: entries.map(mapStandingsEntry) }];
  }
  return (node.children ?? []).flatMap(collectStandingsGroups);
}

function mapStandingsEntry(entry: any): StandingsRow {
  const statByName = new Map<string, any>((entry.stats ?? []).map((s: any) => [s.name, s]));
  const extra: ExtraFact[] = [];
  for (const name of STANDINGS_STAT_ORDER) {
    const stat = statByName.get(name);
    if (stat) extra.push({ label: stat.shortDisplayName, value: stat.displayValue });
  }
  const wins = statByName.get("wins")?.displayValue;
  const losses = statByName.get("losses")?.displayValue;
  const ties = statByName.get("ties")?.displayValue;
  const summary = wins != null && losses != null ? `${wins}-${losses}${ties && ties !== "0" ? `-${ties}` : ""}` : undefined;

  return {
    team: entry.team?.displayName ?? entry.team?.name,
    imageUrl: entry.team?.logos?.[0]?.href,
    rank: statByName.get("playoffSeed")?.displayValue,
    summary,
    extra: extra.length ? extra : undefined,
  };
}

// espnPath e.g. "football/nfl", "basketball/nba", "hockey/nhl"
export function buildEspnScoreboardRouter(espnPath: string, sport: string, league: string): Router {
  const router = Router();
  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard`;

  router.get("/", async (_req, res) => {
    try {
      const data: any = await cached(`espn:${sport}:scoreboard`, 60, () => curlGetJson(url));

      const events: NormalizedEvent[] = (data.events ?? []).map((e: any) => {
        const comp = e.competitions?.[0];
        const competitors = comp?.competitors ?? [];
        const teams = competitors.map((c: any) => ({
          name: c.team?.displayName ?? c.team?.shortDisplayName,
          imageUrl: c.team?.logo,
          record: c.records?.find((r: any) => r.type === "total")?.summary ?? c.records?.[0]?.summary,
        }));
        const teamNames = competitors.map((c: any) => c.team?.shortDisplayName).join(" @ ");

        const extra: ExtraFact[] = [];

        // Live score, when the game has actually started — shown on the
        // main-page card itself (via seriesScore), same slot esports/FRC use
        // for their current-state summary, not just buried in detail facts.
        const state = e.status?.type?.state ?? "pre";
        let seriesScore: string | undefined;
        if (state !== "pre" && competitors.length === 2) {
          const score = competitors.map((c: any) => c.score).join("-");
          if (score && score !== "-") seriesScore = score;
        }

        // Live game clock/period (e.g. "8:42 - 3rd Quarter"), when ESPN
        // provides it — this is the field ESPN's site API conventionally
        // uses for this, though it's not been verified against a live
        // response from this sandbox (network-restricted).
        const liveDetail = state === "in" ? e.status?.type?.shortDetail || e.status?.type?.detail : undefined;

        return {
          id: e.id,
          sport,
          league,
          name: teamNames || e.name,
          startTime: e.date,
          status: mapStatus(state),
          detailUrl: comp?.links?.[0]?.href,
          venue: comp?.venue?.fullName,
          teams: teams.length ? teams : undefined,
          seriesScore,
          liveDetail,
          extra: extra.length ? extra : undefined,
        };
      });

      res.json({ events, source: "espn (unofficial)" });
    } catch (err) {
      res.status(502).json({ error: `Failed to fetch ${league} data`, detail: String(err) });
    }
  });

  router.get("/standings", async (_req, res) => {
    try {
      const data: any = await cached(`espn:${sport}:standings`, 30 * 60, () =>
        curlGetJson(`https://site.api.espn.com/apis/v2/sports/${espnPath}/standings`)
      );

      const groups = collectStandingsGroups(data);
      res.json({ groups, source: "espn (unofficial)" });
    } catch (err) {
      res.status(502).json({ error: `Failed to fetch ${league} standings`, detail: String(err) });
    }
  });

  return router;
}
