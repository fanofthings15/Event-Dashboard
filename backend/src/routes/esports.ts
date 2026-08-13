import { Router } from "express";
import { cached } from "../cache.js";
import { readSettings } from "../settings.js";
import type { NormalizedEvent, Sport } from "../types.js";

const router = Router();

// PandaScore's videogame slugs. "csgo" is still the slug PandaScore uses for
// Counter-Strike 2 matches as of writing — if they rename it, update here.
const GAME_SLUGS: Record<string, Sport> = {
  csgo: "cs2",
  lol: "lol",
  "rocket-league": "rocket-league",
};

function mapStatus(status: string): NormalizedEvent["status"] {
  if (status === "running") return "live";
  if (status === "finished" || status === "canceled") return "finished";
  return "upcoming";
}

async function fetchGame(slug: string, sport: Sport, apiKey: string): Promise<NormalizedEvent[]> {
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
    };
  });
}

router.get("/", async (_req, res) => {
  const { pandaScoreApiKey } = readSettings();
  if (!pandaScoreApiKey) {
    return res.status(200).json({
      events: [],
      source: "pandascore",
      warnings: ["No PandaScore API key set yet — add one in Settings (free at pandascore.co)."],
    });
  }

  const slugs = Object.entries(GAME_SLUGS);
  const settled = await Promise.allSettled(
    slugs.map(([slug, sport]) => cached(`esports:${slug}`, 120, () => fetchGame(slug, sport, pandaScoreApiKey)))
  );

  const events: NormalizedEvent[] = [];
  const warnings: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") events.push(...result.value);
    else warnings.push(String(result.reason?.message ?? result.reason));
  });

  res.json({
    events,
    source: "pandascore (free tier — ~1000 req/month)",
    warnings: warnings.length ? warnings : undefined,
  });
});

export default router;
