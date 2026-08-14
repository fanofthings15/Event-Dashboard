import { Router } from "express";
import { cached } from "./cache.js";
import type { NormalizedEvent, ExtraFact } from "./types.js";

function mapStatus(state: string): NormalizedEvent["status"] {
  if (state === "in") return "live";
  if (state === "post") return "finished";
  return "upcoming";
}

// espnPath e.g. "football/nfl", "basketball/nba", "hockey/nhl"
export function buildEspnScoreboardRouter(espnPath: string, sport: string, league: string): Router {
  const router = Router();
  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard`;

  router.get("/", async (_req, res) => {
    try {
      const data: any = await cached(`espn:${sport}:scoreboard`, 60, async () => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`ESPN responded ${r.status}`);
        return r.json();
      });

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
        const network = comp?.broadcasts?.[0]?.names?.join(", ");
        if (network) extra.push({ label: "Broadcast", value: network });

        // Live score, when the game has actually started — shown on the
        // main-page card itself (via seriesScore), same slot esports/FRC use
        // for their current-state summary, not just buried in detail facts.
        const state = e.status?.type?.state ?? "pre";
        let seriesScore: string | undefined;
        if (state !== "pre" && competitors.length === 2) {
          const score = competitors.map((c: any) => c.score).join("-");
          if (score && score !== "-") seriesScore = score;
        }

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
          extra: extra.length ? extra : undefined,
        };
      });

      res.json({ events, source: "espn (unofficial)" });
    } catch (err) {
      res.status(502).json({ error: `Failed to fetch ${league} data`, detail: String(err) });
    }
  });

  return router;
}
