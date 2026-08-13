import { Router } from "express";
import { cached } from "../cache.js";
import { readSettings } from "../settings.js";
import type { NormalizedEvent } from "../types.js";

const router = Router();

interface TbaEvent {
  key: string;
  name: string;
  event_type_string: string;
  start_date: string; // "YYYY-MM-DD"
  end_date: string; // "YYYY-MM-DD"
  city: string | null;
  state_prov: string | null;
  country: string | null;
  website: string | null;
}

function statusFor(startDate: string, endDate: string): NormalizedEvent["status"] {
  const now = new Date();
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  if (now < start) return "upcoming";
  if (now > end) return "finished";
  return "live";
}

function normalizeTeamKey(input: string): string {
  const trimmed = input.trim();
  // TBA requires the "frcNNN" form — accept a bare number too, since that's
  // the natural thing to type.
  return /^\d+$/.test(trimmed) ? `frc${trimmed}` : trimmed;
}

router.get("/", async (_req, res) => {
  const { tbaApiKey, frcTeamKey, frcFollowEnabled } = readSettings();
  if (!tbaApiKey) {
    return res.status(200).json({
      events: [],
      source: "thebluealliance",
      warnings: ["No Blue Alliance API key set yet — add one in Settings (free at thebluealliance.com/account)."],
    });
  }

  const year = new Date().getFullYear();
  const team = normalizeTeamKey(frcTeamKey);
  const authHeaders = { "X-TBA-Auth-Key": tbaApiKey, "User-Agent": "event-dashboard (personal use)" };
  const warnings: string[] = [];

  try {
    // Always the full event list — the followed team never hides other events.
    const data: TbaEvent[] = await cached(`frc:events:${year}`, 60 * 60, async () => {
      const r = await fetch(`https://www.thebluealliance.com/api/v3/events/${year}/simple`, { headers: authHeaders });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`TBA responded ${r.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
      return r.json();
    });

    // A lightweight second call for just the followed team's event keys, so
    // we can tag matching events without fetching per-event rosters.
    let followedKeys: Set<string> = new Set();
    if (team && frcFollowEnabled) {
      try {
        const keys: string[] = await cached(`frc:team-keys:${year}:${team}`, 60 * 60, async () => {
          const r = await fetch(`https://www.thebluealliance.com/api/v3/team/${team}/events/${year}/keys`, { headers: authHeaders });
          if (!r.ok) {
            const body = await r.text().catch(() => "");
            throw new Error(`TBA team lookup for ${team} responded ${r.status}${body ? `: ${body.slice(0, 150)}` : ""}`);
          }
          return r.json();
        });
        followedKeys = new Set(keys);
      } catch (err) {
        // Still show the full event list even if the team lookup fails —
        // but surface why, instead of silently tagging nothing.
        warnings.push(String(err instanceof Error ? err.message : err));
      }
    }

    // Only full events, never individual matches — and only ones that
    // haven't already finished, so this stays a forward-looking schedule.
    const events: NormalizedEvent[] = data
      .filter((e) => statusFor(e.start_date, e.end_date) !== "finished")
      .map((e) => {
        const location = [e.city, e.state_prov, e.country].filter(Boolean).join(", ");
        return {
          id: e.key,
          sport: "frc",
          league: "FRC",
          name: e.name,
          startTime: `${e.start_date}T00:00:00`,
          // Only set endTime when the event actually spans more than one day.
          endTime: e.end_date !== e.start_date ? `${e.end_date}T23:59:59` : undefined,
          status: statusFor(e.start_date, e.end_date),
          detailUrl: e.website || `https://www.thebluealliance.com/event/${e.key}`,
          extra: location ? [{ label: "Location", value: location }] : undefined,
          followed: followedKeys.has(e.key) || undefined,
        };
      });

    res.json({ events, source: "thebluealliance", warnings: warnings.length ? warnings : undefined });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch FRC data", detail: String(err) });
  }
});

export default router;
