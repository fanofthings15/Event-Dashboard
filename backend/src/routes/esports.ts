import { Router } from "express";
import { cached } from "../cache.js";
import { readGlobalSettings, readUserSettings } from "../settings.js";
import { getUserId } from "../userContext.js";
import { catalogEntry } from "../esportsCatalog.js";
import type { NormalizedEvent, ExtraFact } from "../types.js";

const router = Router();

// Where in its tournament a match is, from PandaScore's names: the
// tournament ("Group Stage", "Group A", "Regular season", "Playoffs") and the
// match's prefix ("Grand Final: A vs B", "Semifinal 1", "Upper Bracket
// Final", "Quarterfinal 2") — checked against real Worlds, CBLOL and CS data.
export function stageOf(m: any): NormalizedEvent["stage"] {
  const match = String(m.name ?? "").split(":")[0].trim();
  const tournament = String(m.tournament?.name ?? "");
  if (/grand final|^final$/i.test(match)) return "final";
  if (/semi-?final|bracket final/i.test(match)) return "semifinal";
  if (/playoff|knockout|bracket|elimination stage|final/i.test(tournament) || /quarter|round of|bracket/i.test(match)) return "playoffs";
  if (/group|swiss|regular|stage|round robin|play-?in|opening|league/i.test(tournament)) return "group";
  return undefined;
}

function mapStatus(status: string): NormalizedEvent["status"] {
  if (status === "running") return "live";
  if (status === "finished" || status === "canceled") return "finished";
  return "upcoming";
}

// Preference order when a match has several streams: YouTube, then Kick,
// then Twitch (the user's least favourite), then anything else.
function platformRank(url: string): number {
  if (/youtube\.com|youtu\.be/i.test(url)) return 0;
  if (/kick\.com/i.test(url)) return 1;
  if (/twitch\.tv/i.test(url)) return 2;
  return 3;
}

function platformLabel(url: string): string {
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (/kick\.com/i.test(url)) return "Kick";
  if (/twitch\.tv/i.test(url)) return "Twitch";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Other";
  }
}

// Every available stream, ranked YouTube-first (the preferred default) —
// exposed in full so the frontend can offer the alternatives too, rather
// than silently hiding everything but the top pick.
function allStreams(streamsList: any[] | undefined): { label: string; url: string }[] {
  const candidates = (streamsList ?? []).filter((s) => s.raw_url);
  const ranked = candidates
    .map((s) => ({
      url: s.raw_url as string,
      platform: platformRank(s.raw_url),
      quality: s.official && s.main ? 0 : s.main ? 1 : s.official ? 2 : 3,
      // Tiebreaker only — most matches carry a broadcast per region/language
      // (LoL especially: en/ko/vi/fr/... often all tied at the same quality
      // tier), and PandaScore's array order between those ties is otherwise
      // arbitrary, not preference-ordered. Without this, which language
      // lands as the default "Watch live" link is essentially random.
      isEnglish: s.language === "en" ? 0 : 1,
    }))
    .sort((a, b) => a.platform - b.platform || a.quality - b.quality || a.isEnglish - b.isEnglish);

  // A given platform can appear multiple times (different languages, VOD
  // vs live) — keep only the first (best-ranked) URL per platform so the
  // popup doesn't show five YouTube links.
  const seen = new Set<string>();
  const deduped: { label: string; url: string }[] = [];
  for (const s of ranked) {
    const label = platformLabel(s.url);
    if (seen.has(label)) continue;
    seen.add(label);
    deduped.push({ label, url: s.url });
  }
  return deduped;
}


function seriesScore(m: any): string | undefined {
  const bestOf = m.number_of_games;
  const games: any[] = m.games ?? [];
  const opponents: any[] = m.opponents ?? [];
  if (opponents.length !== 2) return bestOf > 1 ? `Best of ${bestOf}` : undefined;

  const [a, b] = opponents.map((o) => o.opponent?.id);
  let winsA = 0;
  let winsB = 0;
  for (const g of games) {
    if (g.status !== "finished" || !g.winner) continue;
    if (g.winner.id === a) winsA++;
    else if (g.winner.id === b) winsB++;
  }
  if (winsA === 0 && winsB === 0) {
    return bestOf > 1 ? `Best of ${bestOf}` : undefined;
  }
  return bestOf > 1 ? `${winsA}-${winsB} (Bo${bestOf})` : `${winsA}-${winsB}`;
}

// Keep in sync with the frontend's own FINISHED_SHELF_LIFE_DAYS (App.tsx) —
// mirrors frc.ts's server-side finished-event cutoff so old matches don't
// pile up in every poll's response forever.
const FINISHED_SHELF_LIFE_DAYS = 7;

async function fetchMatches(slug: string, apiKey: string, filterStatus: string, sort: string, pageSize: number): Promise<any[]> {
  const url = `https://api.pandascore.co/${slug}/matches?filter[status]=${filterStatus}&sort=${sort}&page[size]=${pageSize}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${slug} responded ${r.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return r.json();
}

async function fetchGame(slug: string, sport: string, color: string, apiKey: string): Promise<NormalizedEvent[]> {
  // Two separate calls, sorted in opposite directions: a single query
  // covering "finished" too and sorted by begin_at would put every finished
  // match ever (oldest first) ahead of what's live/upcoming now, since
  // finished matches' begin_at values are always in the past. The finished
  // half sorts by scheduled_at rather than begin_at — PandaScore leaves
  // begin_at null on some finished matches (all CS2 forfeits/walkovers seen
  // in practice), which breaks -begin_at ordering entirely (returns an
  // effectively unsorted slice spanning many months instead of the most
  // recent matches).
  const [active, finishedRaw] = await Promise.all([
    fetchMatches(slug, apiKey, "running,not_started", "begin_at", 25),
    fetchMatches(slug, apiKey, "finished", "-scheduled_at", 15),
  ]);

  const cutoff = Date.now() - FINISHED_SHELF_LIFE_DAYS * 24 * 60 * 60 * 1000;
  // PandaScore leaves begin_at/end_at null on some finished CS2 matches
  // (forfeits/walkovers seen in practice) even though scheduled_at is
  // always populated — matches the fallback the mapper below uses for
  // startTime. Without this, those matches' timestamp resolves to the
  // Unix epoch and gets cut as "too old" even though they just finished.
  const finished = finishedRaw.filter((m) => new Date(m.end_at ?? m.begin_at ?? m.scheduled_at).getTime() >= cutoff);

  // A match could in theory show up in both calls if it transitioned status
  // between the two nearly-simultaneous requests — keep the active copy.
  const seen = new Set<string>();
  const matches: any[] = [];
  for (const m of [...active, ...finished]) {
    const id = String(m.id);
    if (seen.has(id)) continue;
    seen.add(id);
    matches.push(m);
  }

  return matches.map((m) => {
    const opponents = m.opponents ?? [];
    const teams = opponents.map((o: any) => ({
      name: o.opponent?.name ?? "TBD",
      imageUrl: o.opponent?.image_url ?? undefined,
    }));
    const teamNames = teams.map((t: any) => t.name).join(" vs ");
    const streams = allStreams(m.streams_list);

    const extra: ExtraFact[] = [];

    return {
      id: String(m.id),
      sport,
      league: m.league?.name ?? slug,
      name: teamNames || m.name,
      startTime: m.begin_at ?? m.scheduled_at,
      endTime: m.end_at ?? undefined,
      status: mapStatus(m.status),
      color,
      teams: teams.length ? teams : undefined,
      streamUrl: streams[0]?.url,
      streams: streams.length ? streams : undefined,
      seriesScore: seriesScore(m),
      tier: /^[sabcd]$/.test(m.tournament?.tier ?? "") ? m.tournament.tier : undefined,
      stage: stageOf(m),
      extra: extra.length ? extra : undefined,
      detailUrl: m.league?.url ?? undefined,
    };
  });
}

// Whether a Kick channel is broadcasting right now, from Kick's channel API
// (checked to work server-side) — undefined when it can't be told, so an
// outage there never reorders anything. PandaScore often lists an event's
// main channel while the match is actually on a sister channel (CCT runs
// cct_cs, cct_cs2, cct_cs3...), which embedded as a dead "offline" player.
async function kickLive(channel: string): Promise<boolean | undefined> {
  try {
    return await cached(`kick-live:${channel.toLowerCase()}`, 60, async () => {
      const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(`kick ${r.status}`);
      const d: any = await r.json();
      return Boolean(d?.livestream);
    });
  } catch {
    return undefined;
  }
}

const kickChannel = (url: string) => {
  try {
    const u = new URL(url);
    return /(^|\.)kick\.com$/.test(u.hostname) ? u.pathname.split("/").filter(Boolean)[0] : undefined;
  } catch {
    return undefined;
  }
};

// For matches under way (or about to be), an offline Kick channel goes to the
// back of the stream list, so "Watch live" and the /live display pick a
// stream that's actually on.
export async function liveStreamsFirst(events: NormalizedEvent[]): Promise<NormalizedEvent[]> {
  const soon = Date.now() + 10 * 60_000;
  return Promise.all(
    events.map(async (e) => {
      if (e.status === "finished" || !e.streams?.length || new Date(e.startTime).getTime() > soon) return e;
      if (!e.streams.some((st) => kickChannel(st.url))) return e;
      const live = await Promise.all(e.streams.map((st) => (kickChannel(st.url) ? kickLive(kickChannel(st.url)!) : Promise.resolve(undefined))));
      if (!live.some((l) => l === false)) return e;
      const streams = e.streams.map((st, i) => ({ st, off: live[i] === false })).sort((a, b) => Number(a.off) - Number(b.off)).map((x) => x.st);
      return { ...e, streams, streamUrl: streams[0].url };
    })
  );
}

router.get("/", async (req, res) => {
  const { pandaScoreApiKey } = readGlobalSettings();
  const { enabledEsportsGames } = readUserSettings(getUserId(req));
  if (!pandaScoreApiKey) {
    return res.status(200).json({
      events: [],
      source: "pandascore",
      warnings: ["No PandaScore API key set yet — add one in Settings (free at pandascore.co)."],
    });
  }

  const games = enabledEsportsGames.map((slug) => catalogEntry(slug)).filter((g): g is NonNullable<typeof g> => Boolean(g));

  const settled = await Promise.allSettled(
    games.map((g) => cached(`esports:${g.slug}`, 120, () => fetchGame(g.slug, g.sport, g.color, pandaScoreApiKey)))
  );

  const events: NormalizedEvent[] = [];
  const warnings: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") events.push(...result.value);
    else warnings.push(`${games[i].label}: ${String(result.reason?.message ?? result.reason)}`);
  });

  res.json({
    events: await liveStreamsFirst(events),
    source: "pandascore (free tier — ~1000 req/month)",
    warnings: warnings.length ? warnings : undefined,
  });
});

export default router;
