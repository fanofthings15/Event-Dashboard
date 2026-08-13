import { Router } from "express";
import { cached } from "../cache.js";
import type { NormalizedEvent } from "../types.js";

const router = Router();

const JOLPICA_URL = "https://api.jolpi.ca/ergast/f1/current.json";

router.get("/", async (_req, res) => {
  try {
    const data: any = await cached("f1:season", 60 * 60, async () => {
      const r = await fetch(JOLPICA_URL);
      if (!r.ok) throw new Error(`Jolpica responded ${r.status}`);
      return r.json();
    });

    const races = data?.MRData?.RaceTable?.Races ?? [];
    const now = Date.now();

    const events: NormalizedEvent[] = races.map((race: any) => {
      const startTime = race.time ? `${race.date}T${race.time}` : `${race.date}T00:00:00Z`;
      const start = new Date(startTime).getTime();
      // No live-timing feed on the free tier — approximate "live" as within a
      // ~3hr window of the scheduled race start.
      const status = start > now ? "upcoming" : now - start < 3 * 60 * 60 * 1000 ? "live" : "finished";
      return {
        id: `${race.season}-${race.round}`,
        sport: "f1",
        league: "F1",
        name: race.raceName,
        startTime,
        status,
        detailUrl: race.url,
      };
    });

    res.json({ events, source: "jolpica (schedule only, no live timing)" });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch F1 data", detail: String(err) });
  }
});

export default router;
