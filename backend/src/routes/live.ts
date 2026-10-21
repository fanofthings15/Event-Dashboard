import { Router } from "express";
import { cached } from "../cache.js";
import { curlGetJson } from "../espnScoreboard.js";
import { ESPN_PATHS, mapEspnSummary } from "../liveEspn.js";
import { getF1LiveState } from "../f1Live.js";
import { mlbExtras } from "../liveMlb.js";
import { readGlobalSettings, readUserSettings } from "../settings.js";
import { getUserId } from "../userContext.js";

// Per-game detail for the full-screen /live display — the regular feeds
// (routes/nfl.ts etc.) only carry score + clock, this adds field position,
// shots, pitches, flags and so on. Polled every few seconds by one screen,
// so each upstream call is cached briefly to keep that cheap.
const router = Router();

router.get("/espn/:sport/:id", async (req, res) => {
  const { sport, id } = req.params;
  const path = ESPN_PATHS[sport];
  if (!path || !/^\d+$/.test(id)) return res.status(400).json({ error: "Unknown sport or game id" });
  try {
    const data = await cached(`live:espn:${sport}:${id}`, 4, () =>
      curlGetJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${id}`)
    );
    const state = mapEspnSummary(sport, data);
    if (state.kind === "baseball" && state.startTime) {
      const [away, home] = state.teams;
      try {
        Object.assign(state, await mlbExtras(state.startTime, away?.name ?? "", home?.name ?? ""));
      } catch {
        // Stats API down or game not found: the view falls back to a
        // generic ballpark and no hit chart.
      }
    }
    res.json(state);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch ${sport} game ${id}`, detail: String(err) });
  }
});

router.get("/f1", async (_req, res) => {
  try {
    res.json(await getF1LiveState());
  } catch (err) {
    res.status(502).json({ error: "Failed to read F1 live timing", detail: String(err) });
  }
});

// ---------- FRC ----------

interface TbaMatch {
  key: string;
  comp_level: string;
  set_number: number;
  match_number: number;
  alliances: { red: { score: number; team_keys: string[] }; blue: { score: number; team_keys: string[] } };
  winning_alliance: string;
  time: number | null;
  predicted_time: number | null;
  actual_time: number | null;
}

const LEVEL_ORDER = ["qm", "ef", "qf", "sf", "f"];

function matchLabel(m: TbaMatch): string {
  if (m.comp_level === "qm") return `Qual ${m.match_number}`;
  if (m.comp_level === "f") return `Final ${m.match_number}`;
  // Double-elimination playoffs (2023+) number every playoff match as its
  // own set with match_number 1.
  if (m.comp_level === "sf") return `Playoff ${m.set_number}`;
  return `${m.comp_level.toUpperCase()} ${m.set_number}-${m.match_number}`;
}

const isPlayed = (m: TbaMatch) => Boolean(m.winning_alliance) || m.alliances.red.score >= 0;
const teamNum = (key: string) => key.replace(/^frc/, "");

function alliance(m: TbaMatch, side: "red" | "blue") {
  return { teams: m.alliances[side].team_keys.map(teamNum), score: m.alliances[side].score >= 0 ? m.alliances[side].score : undefined };
}

router.get("/frc/:eventKey", async (req, res) => {
  const { eventKey } = req.params;
  if (!/^\d{4}[a-z0-9]+$/.test(eventKey)) return res.status(400).json({ error: "Bad event key" });
  const { tbaApiKey } = readGlobalSettings();
  if (!tbaApiKey) return res.status(200).json({ kind: "frc", error: "No TBA API key set" });
  const { frcTeamKey } = readUserSettings(getUserId(req));
  const headers = { "X-TBA-Auth-Key": tbaApiKey };
  const tba = async (path: string) => {
    const r = await fetch(`https://www.thebluealliance.com/api/v3${path}`, { headers });
    if (!r.ok) throw new Error(`TBA ${path} responded ${r.status}`);
    return r.json();
  };

  try {
    const [matches, rankings, event] = await Promise.all([
      cached(`live:frc:matches:${eventKey}`, 60, () => tba(`/event/${eventKey}/matches/simple`)) as Promise<TbaMatch[]>,
      cached(`live:frc:rankings:${eventKey}`, 120, () => tba(`/event/${eventKey}/rankings`).catch(() => null)) as Promise<any>,
      cached(`live:frc:event:${eventKey}`, 3600, () => tba(`/event/${eventKey}/simple`)) as Promise<any>,
    ]);

    const ordered = [...matches].sort(
      (a, b) =>
        LEVEL_ORDER.indexOf(a.comp_level) - LEVEL_ORDER.indexOf(b.comp_level) || a.set_number - b.set_number || a.match_number - b.match_number
    );
    const played = ordered.filter(isPlayed);
    const last = played.sort((a, b) => (a.actual_time ?? 0) - (b.actual_time ?? 0)).at(-1);
    const unplayed = ordered.filter((m) => !isPlayed(m));
    const onField = unplayed[0];
    const quals = ordered.filter((m) => m.comp_level === "qm").length;

    const team = frcTeamKey?.trim().toLowerCase();
    const teamKey = team ? (team.startsWith("frc") ? team : `frc${team}`) : undefined;
    const nextForTeam = teamKey ? unplayed.find((m) => [...m.alliances.red.team_keys, ...m.alliances.blue.team_keys].includes(teamKey)) : undefined;
    const rankRows: any[] = rankings?.rankings ?? [];
    const myRank = teamKey ? rankRows.find((r) => r.team_key === teamKey) : undefined;
    const rec = (r: any) => (r?.record ? `${r.record.wins}-${r.record.losses}-${r.record.ties}` : undefined);

    res.json({
      kind: "frc",
      eventName: event?.short_name || event?.name || eventKey,
      quals,
      last: last
        ? { label: matchLabel(last), red: alliance(last, "red"), blue: alliance(last, "blue"), winner: last.winning_alliance || undefined }
        : undefined,
      onField: onField
        ? { label: matchLabel(onField), red: alliance(onField, "red"), blue: alliance(onField, "blue"), time: onField.predicted_time ?? onField.time ?? undefined }
        : undefined,
      myTeam: teamKey
        ? {
            number: teamNum(teamKey),
            rank: myRank?.rank,
            record: rec(myRank),
            rankedTeams: rankRows.length || undefined,
            next: nextForTeam
              ? {
                  label: matchLabel(nextForTeam),
                  alliance: nextForTeam.alliances.red.team_keys.includes(teamKey) ? "red" : "blue",
                  time: nextForTeam.predicted_time ?? nextForTeam.time ?? undefined,
                }
              : undefined,
          }
        : undefined,
      rankings: rankRows.slice(0, 8).map((r) => ({ rank: r.rank, team: teamNum(r.team_key), record: rec(r) })),
    });
  } catch (err) {
    res.status(502).json({ kind: "frc", error: `Failed to fetch FRC event ${eventKey}`, detail: String(err) });
  }
});

export default router;
