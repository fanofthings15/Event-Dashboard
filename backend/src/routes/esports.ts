import { Router } from "express";
import { cached } from "../cache.js";
import { readSettings } from "../settings.js";
import { catalogEntry } from "../esportsCatalog.js";
import type { NormalizedEvent } from "../types.js";

const router = Router();

function mapStatus(status: string): NormalizedEvent["status"] {
  if (status === "running") return "live";
  if (status === "finished" || status === "canceled") return "finished";
  return "upcoming";
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
    const teams = (m.opponents ?? []).map((o: any) => o.opponent?.name ?? "TBD").join(" vs ");
    return {
      id: String(m.id),
      sport,
      league: m.league?.name ?? slug,
      name: teams || m.name,
      startTime: m.begin_at ?? m.scheduled_at,
      status: mapStatus(m.status),
      color,
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
