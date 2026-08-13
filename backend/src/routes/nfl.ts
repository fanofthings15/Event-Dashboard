import { Router } from "express";
import { cached } from "../cache.js";
import type { NormalizedEvent } from "../types.js";

const router = Router();

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

function mapStatus(state: string): NormalizedEvent["status"] {
  if (state === "in") return "live";
  if (state === "post") return "finished";
  return "upcoming";
}

router.get("/", async (_req, res) => {
  try {
    const data: any = await cached("nfl:scoreboard", 60, async () => {
      const r = await fetch(ESPN_URL);
      if (!r.ok) throw new Error(`ESPN responded ${r.status}`);
      return r.json();
    });

    const events: NormalizedEvent[] = (data.events ?? []).map((e: any) => {
      const comp = e.competitions?.[0];
      const teams = comp?.competitors?.map((c: any) => c.team?.shortDisplayName).join(" @ ") ?? e.shortName;
      return {
        id: e.id,
        sport: "nfl",
        league: "NFL",
        name: teams || e.name,
        startTime: e.date,
        status: mapStatus(e.status?.type?.state ?? "pre"),
        detailUrl: comp?.links?.[0]?.href,
      };
    });

    res.json({ events, source: "espn (unofficial)" });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch NFL data", detail: String(err) });
  }
});

export default router;
