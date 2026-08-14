import { Router } from "express";
import { cached } from "../cache.js";
import { readSettings } from "../settings.js";
import { computeMatchProgress } from "../frcMatchProgress.js";
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

interface TbaDistrict {
  abbreviation: string; // e.g. "fim", "fit"
  display_name: string;
  key: string; // e.g. "2026fim"
  year: number;
}

// Single-state districts, plus the multi-state ones — derived from the
// actual 2026 event lists (each district's real event keys start with
// their member states' codes), not guessed. This is what makes off-season
// events (which TBA doesn't tag under the district's official competition
// series at all, e.g. MARC or Ferris State Roboday, both in Michigan) still
// show the right region — state_prov is reliable even when TBA's own
// district-events list doesn't include the event.
const STATE_TO_DISTRICT: Record<string, string> = {
  MI: "FIM",
  TX: "FIT",
  IN: "FIN",
  WI: "WIN",
  GA: "PCH",
  SC: "FSC",
  NC: "FNC",
  ON: "ONT",
  OR: "PNW",
  WA: "PNW",
  CT: "NE",
  MA: "NE",
  ME: "NE",
  NH: "NE",
  RI: "NE",
  VT: "NE",
  NJ: "FMA",
  PA: "FMA",
  MD: "FCH",
  VA: "FCH",
  CA: "CA",
};

// FRC district events (e.g. FIM = FIRST In Michigan, FIT = FIRST In Texas)
// use the district abbreviation as the region — it's the name people
// actually recognize. Non-districted "regional" events (most of the
// country) have no district, so those fall back to the plain state code.
// Built independently of the main events list (rather than trusting a
// `district` field might be present on it) via TBA's dedicated district
// endpoints, so this doesn't depend on an unverified assumption about
// which fields the events/simple response includes.
async function buildDistrictMap(year: number, authHeaders: Record<string, string>): Promise<Map<string, string>> {
  return cached(`frc:district-map:${year}`, 60 * 60, async () => {
    const districtsRes = await fetch(`https://www.thebluealliance.com/api/v3/districts/${year}`, { headers: authHeaders });
    if (!districtsRes.ok) {
      console.error(`[frc-districts] /districts/${year} responded ${districtsRes.status} — no district names will show this session.`);
      return new Map<string, string>();
    }
    const districts: TbaDistrict[] = await districtsRes.json();
    console.log(`[frc-districts] found ${districts.length} districts for ${year}: ${districts.map((d) => d.abbreviation).join(", ")}`);

    const map = new Map<string, string>();
    await Promise.allSettled(
      districts.map(async (d) => {
        const r = await fetch(`https://www.thebluealliance.com/api/v3/district/${d.key}/events/keys`, { headers: authHeaders });
        if (!r.ok) {
          console.error(`[frc-districts] /district/${d.key}/events/keys responded ${r.status} — ${d.abbreviation} events will show state code instead.`);
          return;
        }
        const eventKeys: string[] = await r.json();
        for (const key of eventKeys) map.set(key, d.abbreviation.toUpperCase());
      })
    );
    console.log(`[frc-districts] built map with ${map.size} event->district entries total`);
    return map;
  });
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

    let districtMap = new Map<string, string>();
    try {
      districtMap = await buildDistrictMap(year, authHeaders);
    } catch (err) {
      warnings.push(`Could not load FRC district names, showing state codes instead: ${err instanceof Error ? err.message : err}`);
    }

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
        const districtRegion = districtMap.get(e.key) || (e.state_prov ? STATE_TO_DISTRICT[e.state_prov] : undefined);
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
          region: districtRegion || e.state_prov || undefined,
        };
      });

    // Match progress ("Qual Match 23 of 40", "Semifinals — Match 2") only
    // makes sense for events actually happening today — fetching it for the
    // whole season's events would be a lot of wasted TBA calls for nothing.
    const liveEvents = events.filter((e) => e.status === "live");
    if (liveEvents.length > 0) {
      const settled = await Promise.allSettled(
        liveEvents.map((e) =>
          cached(`frc:matches:${e.id}`, 120, async () => {
            const r = await fetch(`https://www.thebluealliance.com/api/v3/event/${e.id}/matches/simple`, { headers: authHeaders });
            if (!r.ok) throw new Error(`TBA matches for ${e.id} responded ${r.status}`);
            return r.json();
          })
        )
      );
      settled.forEach((result, i) => {
        if (result.status === "fulfilled") {
          liveEvents[i].seriesScore = computeMatchProgress(result.value as any[]);
        }
        // A failed per-event match lookup just means no progress line shows
        // for that one event — not worth surfacing as a user-facing warning.
      });
    }

    res.json({ events, source: "thebluealliance", warnings: warnings.length ? warnings : undefined });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch FRC data", detail: String(err) });
  }
});

export default router;
