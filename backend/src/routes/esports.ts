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

function bestStream(streamsList: any[] | undefined): string | undefined {
  const candidates = (streamsList ?? []).filter((s) => s.raw_url);
  if (!candidates.length) return undefined;

  const ranked = candidates
    .map((s) => ({
      url: s.raw_url as string,
      platform: platformRank(s.raw_url),
      quality: s.official && s.main ? 0 : s.main ? 1 : s.official ? 2 : 3,
    }))
    .sort((a, b) => a.platform - b.platform || a.quality - b.quality);

  return ranked[0].url;
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

    const extra: ExtraFact[] = [];
    const seriesLabel = m.serie?.full_name || m.tournament?.name;
    // PandaScore auto-names a series/tournament "Tournament <year>" (or
    // similar) when the organizer never gave it a real name — showing that
    // verbatim isn't useful, so skip it rather than clutter the detail view.
    const looksGeneric = seriesLabel && /^(tournament|series|serie)\s*\d{4}$/i.test(seriesLabel.trim());
    if (seriesLabel && !looksGeneric) extra.push({ label: "Tournament", value: seriesLabel });

    return {
      id: String(m.id),
      sport,
      league: m.league?.name ?? slug,
      name: teamNames || m.name,
      startTime: m.begin_at ?? m.scheduled_at,
      status: mapStatus(m.status),
      color,
      teams: teams.length ? teams : undefined,
      streamUrl: bestStream(m.streams_list),
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
