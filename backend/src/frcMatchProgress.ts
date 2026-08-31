interface TbaMatch {
  key: string;
  comp_level: string; // "qm" | "ef" | "qf" | "sf" | "f"
  match_number: number;
  set_number: number;
  alliances?: { red?: { score: number }; blue?: { score: number } };
  winning_alliance?: string;
  actual_time?: number | null;
}

const LEVEL_ORDER = ["qm", "ef", "qf", "sf", "f"];
const LEVEL_LABEL: Record<string, string> = {
  qm: "Qualification",
  ef: "Eighth-Finals",
  qf: "Quarterfinals",
  sf: "Semifinals",
  f: "Finals",
};

// Same definition of "played" the FRC Commentary Dashboard uses: a decided
// winner, or a real (non-negative) score posted.
function isPlayed(m: TbaMatch): boolean {
  return Boolean(m.winning_alliance) || (m.alliances?.red?.score ?? -1) >= 0;
}

// TBA's events endpoint only gives day-granularity dates, so a day inside
// [start_date, end_date] otherwise reads as the event being "live" the
// instant the calendar day begins — hours before the first match is
// actually called. `actual_time` is TBA's own signal that a match has
// really started (posted once the field crew calls it); an empty or
// all-scheduled-only match list means the day has arrived but play hasn't.
export function hasMatchPlayStarted(matches: TbaMatch[]): boolean {
  return matches.some((m) => isPlayed(m) || Boolean(m.actual_time));
}

export function computeMatchProgress(matches: TbaMatch[]): string | undefined {
  if (!matches.length) return undefined;

  const byLevel = new Map<string, TbaMatch[]>();
  for (const m of matches) {
    if (!byLevel.has(m.comp_level)) byLevel.set(m.comp_level, []);
    byLevel.get(m.comp_level)!.push(m);
  }

  // Walk qual -> playoff rounds in order; the "current" stage is the first
  // one that isn't fully played yet, or the last stage that exists if
  // everything so far is complete (event wrapping up).
  let currentLevel: string | null = null;
  for (const level of LEVEL_ORDER) {
    const levelMatches = byLevel.get(level);
    if (!levelMatches) continue;
    currentLevel = level;
    if (!levelMatches.every(isPlayed)) break;
  }
  if (!currentLevel) return undefined;

  const levelMatches = [...byLevel.get(currentLevel)!].sort((a, b) => a.match_number - b.match_number);
  const playedCount = levelMatches.filter(isPlayed).length;
  const allPlayed = playedCount === levelMatches.length;

  if (currentLevel === "qm") {
    if (allPlayed) return `Qualification complete (${levelMatches.length} matches)`;
    return `Qual Match ${playedCount + 1} of ${levelMatches.length}`;
  }

  const label = LEVEL_LABEL[currentLevel] ?? currentLevel.toUpperCase();
  if (allPlayed) return currentLevel === "f" ? "Playoffs complete" : `${label} complete`;

  const upcoming = levelMatches[playedCount];
  const setLabel = upcoming?.set_number ? ` (Set ${upcoming.set_number})` : "";
  return `${label} — Match ${playedCount + 1}${setLabel}`;
}
