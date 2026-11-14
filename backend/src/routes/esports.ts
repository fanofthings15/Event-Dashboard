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
function allStreams(streamsList: any[] | undefined, officialYouTube: Set<string> = new Set()): { label: string; url: string }[] {
  const candidates = (streamsList ?? []).filter((s) => s.raw_url);
  const ranked = candidates
    .map((s) => ({
      url: s.raw_url as string,
      platform: platformRank(s.raw_url),
      quality: (s.official && s.main) || officialYouTube.has(s.raw_url) ? 0 : s.main ? 1 : s.official ? 2 : 3,
      // Most matches carry a broadcast per region/language
      // (LoL especially: en/ko/vi/fr/... often all tied at the same quality
      // tier), and PandaScore's array order between those ties is otherwise
      // arbitrary, not preference-ordered. Without this, which language
      // lands as the default "Watch live" link is essentially random.
      isEnglish: s.language === "en" ? 0 : 1,
    }))
    // English first (the user wants English), then the official/main
    // broadcast, then platform (YouTube first). A YouTube stream on the
    // organizer's own channel counts as official too (officialYouTubeUrls). Language labels aren't trustworthy on their
    // own: a Worlds match had the Japanese YouTube co-stream ("[JP] Worlds
    // 2026 | LoL Esports JP") tagged "en", which won on platform while Riot's
    // official English Twitch (main, official) sat behind it.
    .sort((a, b) => a.isEnglish - b.isEnglish || a.quality - b.quality || a.platform - b.platform);

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

// PandaScore flags only one stream per match as the main/official one, so
// the organizer's own YouTube simulcast loses to its flagged Twitch on
// "official" before YouTube's platform preference is reached. An English
// YouTube stream (as PandaScore tags it) counts as the main broadcast too when
// either:
// - its channel (name or @handle, from YouTube's oEmbed, no key, cached a
//   day) is the flagged Twitch/Kick stream's channel (BLAST Rivals
//   2026-11-11: BLAST Premier's YouTube, unflagged, behind twitch.tv/
//   blastpremier). Flagged or not: PandaScore adds the official flag
//   mid-match (LCP NH vs SGW, 2026-11-12, official once game 1 ended), and
//   skipping flagged ones switched the display to Twitch when a map was won;
// - or PandaScore flags it official and its title and channel show no other
//   language. The organizer's YouTube is often a differently named channel
//   from its Twitch (R6: "Rainbow Six Esports" beside twitch.tv/rainbow6;
//   Worlds: "LoL Esports" beside twitch.tv/riotgames), so the names never
//   match. PandaScore's "en" tag alone isn't enough: a Worlds match had the
//   Japanese co-stream ("[JP] Worlds 2026 | LoL Esports JP") tagged "en",
//   which won on platform over Riot's English Twitch (see allStreams) — its
//   [JP] tag, a channel ending in a language code, or a title in another
//   script (LCK's Korean ones) keeps such a stream where it was.
const chan = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function channelOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (/(^|\.)(twitch\.tv|kick\.com)$/.test(u.hostname)) return u.pathname.split("/").filter(Boolean)[0];
    if (/youtube\.com$/.test(u.hostname) && u.pathname.startsWith("/@")) return u.pathname.slice(2).split("/")[0];
  } catch {
    /* not a URL */
  }
  return undefined;
}

interface YouTubeInfo {
  names: string[]; // the channel's name and @handle, squashed by chan()
  title: string;
  author: string;
}

// The last answer oEmbed gave for each stream, kept past the day-long cache:
// a lookup that fails (timeout, a 5xx) answers with it instead of nothing, so
// one bad lookup doesn't drop the YouTube stream behind Twitch for a poll and
// switch the display's player over and back.
const lastInfo = new Map<string, YouTubeInfo>();

async function youTubeInfo(url: string): Promise<YouTubeInfo | undefined> {
  try {
    const info = await cached(`yt-info:${url}`, 24 * 3600, async (): Promise<YouTubeInfo> => {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(`oembed ${r.status}`);
      const d: any = await r.json();
      const author = String(d?.author_name ?? "");
      const handle = String(d?.author_url ?? "").match(/\/@([^/?#]+)/)?.[1];
      return { names: [author, handle].filter((x): x is string => Boolean(x)).map(chan), title: String(d?.title ?? ""), author };
    });
    if (lastInfo.size > 500) lastInfo.clear();
    lastInfo.set(url, info);
    return info;
  } catch {
    return lastInfo.get(url);
  }
}

// Language and region codes broadcasters tag a co-stream with: "[JP] Worlds",
// "LoL Esports JP", "(PT-BR)".
const OTHER_LANGUAGE = new Set(
  "jp ja jpn kr ko kor cn zh chn tw hk vn vi br pt ptbr es la lat fr de ru tr th ar pl it id ph cz cs ua se nl".split(" ")
);
const OTHER_SCRIPT = /(?=\p{L})\P{Script=Latin}/u;

export function looksEnglish(title: string, author: string): boolean {
  if (OTHER_SCRIPT.test(title) || OTHER_SCRIPT.test(author)) return false;
  for (const tag of title.matchAll(/[\[(]\s*([a-z]{2,3}(?:[-_ ]?[a-z]{2})?)\s*[\])]/gi)) {
    if (OTHER_LANGUAGE.has(tag[1].toLowerCase().replace(/[-_ ]/g, ""))) return false;
  }
  const last = author.trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";
  return !(author.trim().includes(" ") && OTHER_LANGUAGE.has(last));
}

async function officialYouTubeUrls(matches: any[]): Promise<Set<string>> {
  const out = new Set<string>();
  const checks: Promise<void>[] = [];
  for (const m of matches) {
    if (m.status === "finished") continue;
    const list: any[] = (m.streams_list ?? []).filter((s: any) => s.raw_url);
    // the flagged Twitch/Kick channels — never a YouTube one, so a stream can't match itself
    const flagged = list
      .filter((s) => (s.main || s.official) && platformRank(s.raw_url) !== 0)
      .map((s) => channelOf(s.raw_url))
      .filter((c): c is string => Boolean(c))
      .map(chan);
    for (const s of list) {
      // main + official already ranks first; anything else, flagged or not, is checked
      if (s.language !== "en" || (s.main && s.official) || platformRank(s.raw_url) !== 0) continue;
      if (!flagged.length && !s.official) continue;
      checks.push(
        youTubeInfo(s.raw_url).then((info) => {
          if (!info) return;
          if (info.names.some((n) => flagged.includes(n)) || (s.official && looksEnglish(info.title, info.author))) out.add(s.raw_url);
        })
      );
    }
  }
  await Promise.all(checks);
  return out;
}

// PandaScore sometimes lists a channel's live tab (youtube.com/@Channel/live,
// R6's Grand Final 2026-11-15) instead of the video, and the display can't
// embed a live tab (no video id), so it fell back to Twitch. For a match
// that's on (or starting within 10 minutes), the live tab is swapped for the
// video it's showing — the page's canonical link while the channel is live.
// Not live yet: left as it was, checked again next poll.
async function liveTabVideo(url: string): Promise<string | undefined> {
  try {
    return await cached(`yt-live:${url}`, 300, async () => {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) throw new Error(`live tab ${r.status}`);
      const html = await r.text();
      const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
      if (!id || !html.includes('"isLive":true')) throw new Error("not live"); // not cached: checked again next poll
      return `https://www.youtube.com/watch?v=${id}`;
    });
  } catch {
    return undefined;
  }
}

const isLiveTab = (url: string) => /^https?:\/\/(www\.)?youtube\.com\/(@[^/]+|channel\/[^/]+|c\/[^/]+)\/live\/?$/i.test(url);

async function resolveLiveTabs(matches: any[]): Promise<void> {
  const soon = Date.now() + 10 * 60_000;
  await Promise.all(
    matches.map(async (m) => {
      if (m.status === "finished" || new Date(m.begin_at ?? m.scheduled_at).getTime() > soon) return;
      const list: any[] = m.streams_list ?? [];
      if (!list.some((s) => s.raw_url && isLiveTab(s.raw_url))) return;
      m.streams_list = await Promise.all(
        list.map(async (s) => {
          if (!s.raw_url || !isLiveTab(s.raw_url)) return s;
          const video = await liveTabVideo(s.raw_url);
          return video ? { ...s, raw_url: video } : s;
        })
      );
    })
  );
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
  // Before the first map ends: "Best of 3" while upcoming, but "0-0 (Bo3)"
  // once it's under way, so a live match shows a score like any other.
  if (winsA === 0 && winsB === 0 && m.status !== "running") {
    return bestOf > 1 ? `Best of ${bestOf}` : undefined;
  }
  return bestOf > 1 ? `${winsA}-${winsB} (Bo${bestOf})` : `${winsA}-${winsB}`;
}

// Keep in sync with the frontend's own FINISHED_SHELF_LIFE_DAYS (App.tsx) —
// mirrors frc.ts's server-side finished-event cutoff so old matches don't
// pile up in every poll's response forever.
const FINISHED_SHELF_LIFE_DAYS = 7;

async function fetchMatches(slug: string, apiKey: string, filterStatus: string, sort: string, pageSize: number, page = 1): Promise<any[]> {
  const url = `https://api.pandascore.co/${slug}/matches?filter[status]=${filterStatus}&sort=${sort}&page[size]=${pageSize}&page[number]=${page}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${slug} responded ${r.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return r.json();
}

// Every running match and every upcoming one starting in the next
// ACTIVE_DAYS (the user's window, 2026-11-10: nothing a month away), soonest
// first. PandaScore's biggest page is 100, so follow the pages until one
// comes back short or runs past the window, up to ACTIVE_PAGES. It used to
// be the first 25 only, and CS has hundreds (291 on 2026-11-10, mostly tier
// C/D) — the 25th started 7 hours out, so BLAST Rivals, a tier-S event 14
// hours away, wasn't on the dashboard at all. Each page is one request
// against the free plan's 1000 an hour; with the 2-minute cache CS costs at
// most 4 (3 pages + finished) every 2 minutes.
const ACTIVE_DAYS = 14;
const ACTIVE_PAGE_SIZE = 100;
const ACTIVE_PAGES = 3;

async function fetchActive(slug: string, apiKey: string): Promise<any[]> {
  const until = Date.now() + ACTIVE_DAYS * 24 * 60 * 60 * 1000;
  const startOf = (m: any) => new Date(m.begin_at ?? m.scheduled_at).getTime();
  const all: any[] = [];
  for (let page = 1; page <= ACTIVE_PAGES; page++) {
    const batch = await fetchMatches(slug, apiKey, "running,not_started", "begin_at", ACTIVE_PAGE_SIZE, page);
    all.push(...batch.filter((m) => m.status === "running" || !(startOf(m) > until)));
    if (batch.length < ACTIVE_PAGE_SIZE || batch.some((m) => startOf(m) > until)) break;
  }
  return all;
}

export async function fetchGame(slug: string, sport: string, color: string, apiKey: string): Promise<NormalizedEvent[]> {
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
    fetchActive(slug, apiKey),
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

  await resolveLiveTabs(matches);
  const officialYouTube = await officialYouTubeUrls(matches);
  return matches.map((m) => {
    const opponents = m.opponents ?? [];
    const teams = opponents.map((o: any) => ({
      name: o.opponent?.name ?? "TBD",
      imageUrl: o.opponent?.image_url ?? undefined,
    }));
    const teamNames = teams.map((t: any) => t.name).join(" vs ");
    const streams = allStreams(m.streams_list, officialYouTube);

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
      // Between maps = a map has been played and none is being played now.
      // Before map 1 starts (warm-up, a late start, PandaScore not showing
      // map 1 running yet) it isn't a break: it used to count as one, so a
      // match that had just gone live handed its spot to another match and
      // only got it back ~4 minutes into map 1 (PandaScore's map-status lag
      // plus the 2-minute cache) — the first round was missed every time.
      mapLive:
        m.status === "running" && m.games?.length
          ? m.games.some((g: any) => g.status === "running")
            ? true
            : m.games.some((g: any) => g.status === "finished")
              ? false
              : undefined
          : undefined,
      // when the last map ended, while between maps: the display counts the
      // break as over BREAK_CAP after this (multiGame.ts isOnBreak)
      mapEndedAt:
        m.status === "running" && m.games?.length && !m.games.some((g: any) => g.status === "running")
          ? (m.games
              .filter((g: any) => g.status === "finished" && g.end_at)
              .map((g: any) => g.end_at as string)
              .sort()
              .at(-1) ?? undefined)
          : undefined,
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
    source: "pandascore (free tier — 1000 req/hour)",
    warnings: warnings.length ? warnings : undefined,
  });
});

export default router;
