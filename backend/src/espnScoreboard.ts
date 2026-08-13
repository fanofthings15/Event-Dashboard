import { Router } from "express";
import { cached } from "./cache.js";
import type { NormalizedEvent } from "./types.js";

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
        const teams = comp?.competitors?.map((c: any) => c.team?.shortDisplayName).join(" @ ") ?? e.shortName;
        return {
          id: e.id,
          sport,
          league,
          name: teams || e.name,
          startTime: e.date,
          status: mapStatus(e.status?.type?.state ?? "pre"),
          detailUrl: comp?.links?.[0]?.href,
        };
      });

      res.json({ events, source: "espn (unofficial)" });
    } catch (err) {
      res.status(502).json({ error: `Failed to fetch ${league} data`, detail: String(err) });
    }
  });

  return router;
}
