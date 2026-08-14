import { Router } from "express";
import { cached } from "../cache.js";
import { readSettings } from "../settings.js";
import { catalogEntry } from "../esportsCatalog.js";
import type { NormalizedEvent, ExtraFact } from "../types.js";

const router = Router();

function mapStatus(status: string): NormalizedEvent["status"] {
  if (status === "running") return "live";
  if (status === "finished" || status === "canceled") return "finished";
  return "upcoming";
}

function platformRank(url: string): number {
  if (/youtube\.com|youtu\.be/i.test(url)) return 0;
  if (/twitch\.tv/i.test(url)) return 1;
  return 2;
}

function platformLabel(url: string): string {
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
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
    }))
    .sort((a, b) => a.platform - b.platform || a.quality - b.quality);

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

async function fetchGame(slug: string, sport: string, color: string, apiKey: string): Promise<NormalizedEvent[]> {
  const url = `https://api.pandascore.co/${slug}/matches?filter[status]=running,not_started&sort=begin_at&page[size]=25`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${slug} responded ${r.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const matches: any[] = await r.json();
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
      status: mapStatus(m.status),
      color,
      teams: teams.length ? teams : undefined,
      streamUrl: streams[0]?.url,
      streams: streams.length ? streams : undefined,
      seriesScore: seriesScore(m),
      extra: extra.length ? extra : undefined,
      detailUrl: m.league?.url ?? undefined,
    };
  });
}

router.get("/", async (_req, res) => {
  const { pandaScoreApiKey, enabledEsportsGames } = readSettings();
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
    events,
    source: "pandascore (free tier — ~1000 req/month)",
    warnings: warnings.length ? warnings : undefined,
  });
});

export default router;
