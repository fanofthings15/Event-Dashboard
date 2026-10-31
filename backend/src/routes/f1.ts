import { Router } from "express";
import { cached } from "../cache.js";
import type { NormalizedEvent, ExtraFact, StandingsGroup, StandingsRow } from "../types.js";

const router = Router();

// The sessions of a race weekend as Jolpica names them, in weekend order.
const SESSIONS: { key: string; id: string; label: string; kind: NonNullable<NormalizedEvent["f1Session"]>; liveMinutes: number }[] = [
  { key: "FirstPractice", id: "fp1", label: "Practice 1", kind: "practice", liveMinutes: 75 },
  { key: "SecondPractice", id: "fp2", label: "Practice 2", kind: "practice", liveMinutes: 75 },
  { key: "ThirdPractice", id: "fp3", label: "Practice 3", kind: "practice", liveMinutes: 75 },
  { key: "SprintQualifying", id: "sq", label: "Sprint Qualifying", kind: "qualifying", liveMinutes: 60 },
  { key: "Sprint", id: "sprint", label: "Sprint", kind: "sprint", liveMinutes: 60 },
  { key: "Qualifying", id: "q", label: "Qualifying", kind: "qualifying", liveMinutes: 75 },
  { key: "race", id: "race", label: "Race", kind: "race", liveMinutes: 180 },
];

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

    // Every session of each weekend is its own event: practice and
    // qualifying (and sprint qualifying + sprint on sprint weekends) as well
    // as the race. The race keeps its old id, so follows and dismissals
    // made before sessions existed still point at it.
    const events: NormalizedEvent[] = races.flatMap((race: any) => {
      const circuit = race.Circuit;
      const extra: ExtraFact[] = [];
      if (circuit?.circuitName) extra.push({ label: "Circuit", value: circuit.circuitName });
      const location = [circuit?.Location?.locality, circuit?.Location?.country].filter(Boolean).join(", ");
      if (location) extra.push({ label: "Location", value: location });

      const sessions = SESSIONS.filter((s) => s.key === "race" || race[s.key]?.date).map((s) => {
        const at = s.key === "race" ? race : race[s.key];
        const startTime = at.time ? `${at.date}T${at.time}` : `${at.date}T00:00:00Z`;
        const start = new Date(startTime).getTime();
        // No live-timing feed on the free tier — "live" is the session's
        // usual length plus some slack (red flags, delays) from its start.
        const status = start > now ? "upcoming" : now - start < s.liveMinutes * 60_000 ? "live" : "finished";
        const event: NormalizedEvent = {
          id: s.key === "race" ? `${race.season}-${race.round}` : `${race.season}-${race.round}-${s.id}`,
          sport: "f1",
          league: "F1",
          name: s.key === "race" ? race.raceName : `${race.raceName} · ${s.label}`,
          startTime,
          status,
          detailUrl: race.url,
          venue: circuit?.circuitName,
          extra: extra.length ? extra : undefined,
          f1Session: s.kind,
        };
        return event;
      });
      return sessions;
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
