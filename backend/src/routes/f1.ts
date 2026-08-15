import { Router } from "express";
import { cached } from "../cache.js";
import type { NormalizedEvent, ExtraFact, StandingsGroup, StandingsRow } from "../types.js";

const router = Router();

const JOLPICA_URL = "https://api.jolpi.ca/ergast/f1/current.json";
const JOLPICA_DRIVER_STANDINGS_URL = "https://api.jolpi.ca/ergast/f1/current/driverStandings.json";
const JOLPICA_CONSTRUCTOR_STANDINGS_URL = "https://api.jolpi.ca/ergast/f1/current/constructorStandings.json";

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

      const circuit = race.Circuit;
      const extra: ExtraFact[] = [];
      if (circuit?.circuitName) extra.push({ label: "Circuit", value: circuit.circuitName });
      const location = [circuit?.Location?.locality, circuit?.Location?.country].filter(Boolean).join(", ");
      if (location) extra.push({ label: "Location", value: location });

      return {
        id: `${race.season}-${race.round}`,
        sport: "f1",
        league: "F1",
        name: race.raceName,
        startTime,
        status,
        detailUrl: race.url,
        venue: circuit?.circuitName,
        extra: extra.length ? extra : undefined,
      };
    });

    res.json({ events, source: "jolpica (schedule only, no live timing)" });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch F1 data", detail: String(err) });
  }
});

router.get("/standings", async (_req, res) => {
  try {
    const [driverData, constructorData]: any[] = await cached("f1:standings", 60 * 60, async () => {
      const [driverRes, constructorRes] = await Promise.all([fetch(JOLPICA_DRIVER_STANDINGS_URL), fetch(JOLPICA_CONSTRUCTOR_STANDINGS_URL)]);
      if (!driverRes.ok) throw new Error(`Jolpica driver standings responded ${driverRes.status}`);
      if (!constructorRes.ok) throw new Error(`Jolpica constructor standings responded ${constructorRes.status}`);
      return Promise.all([driverRes.json(), constructorRes.json()]);
    });

    const driverList = driverData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
    const constructorList = constructorData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];

    const drivers: StandingsRow[] = driverList.map((d: any) => {
      const extra: ExtraFact[] = [
        { label: "PTS", value: d.points },
        { label: "W", value: d.wins },
      ];
      return {
        team: `${d.Driver?.givenName} ${d.Driver?.familyName}`,
        rank: d.position,
        summary: `${d.points} pts`,
        extra,
      };
    });

    const constructors: StandingsRow[] = constructorList.map((c: any) => {
      const extra: ExtraFact[] = [
        { label: "PTS", value: c.points },
        { label: "W", value: c.wins },
      ];
      return {
        team: c.Constructor?.name,
        rank: c.position,
        summary: `${c.points} pts`,
        extra,
      };
    });

    const groups: StandingsGroup[] = [
      { name: "Drivers", rows: drivers },
      { name: "Constructors", rows: constructors },
    ];

    res.json({ groups, source: "jolpica" });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch F1 standings", detail: String(err) });
  }
});

export default router;
