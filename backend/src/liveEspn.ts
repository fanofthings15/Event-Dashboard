// Maps ESPN's per-game summary endpoint into the compact shapes the /live
// full-screen display renders. Every field below was checked against a real
// response (NBA/NHL live games, NFL/MLB finished games, 2026-10-20) unless
// its comment says otherwise.

export const ESPN_PATHS: Record<string, string> = {
  nfl: "football/nfl",
  ncaaf: "football/college-football",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
  mlb: "baseball/mlb",
};

export interface LiveTeam {
  id: string;
  homeAway: "home" | "away";
  abbr: string;
  name: string;
  color?: string; // hex without "#", as ESPN sends it
  altColor?: string;
  logo?: string;
  score: string;
  record?: string;
  linescores: string[];
  timeoutsRemaining?: number;
  hits?: number; // MLB only
  errors?: number; // MLB only
}

export interface LiveCommon {
  teams: LiveTeam[]; // always [away, home]
  state: "pre" | "in" | "post";
  detail: string; // e.g. "1:23 - 2nd", "Top 7th", "Final"
  homeWinPct?: number;
}

function commonFrom(data: any): LiveCommon {
  const comp = data.header?.competitions?.[0] ?? {};
  const teams: LiveTeam[] = (comp.competitors ?? []).map((c: any) => ({
    id: String(c.id ?? c.team?.id),
    homeAway: c.homeAway,
    abbr: c.team?.abbreviation ?? "",
    name: c.team?.displayName ?? c.team?.name ?? "",
    color: c.team?.color,
    altColor: c.team?.alternateColor,
    logo: c.team?.logos?.[0]?.href ?? c.team?.logo,
    score: c.score ?? "0",
    record: c.record?.find?.((r: any) => r.type === "total")?.summary ?? c.record?.[0]?.summary,
    linescores: (c.linescores ?? []).map((l: any) => String(l.displayValue ?? l.value ?? "")),
    timeoutsRemaining: typeof c.timeoutsRemaining === "number" ? c.timeoutsRemaining : undefined,
    hits: typeof c.hits === "number" ? c.hits : undefined,
    errors: typeof c.errors === "number" ? c.errors : undefined,
  }));
  teams.sort((a, b) => (a.homeAway === "away" ? -1 : 1) - (b.homeAway === "away" ? -1 : 1));
  const wp = data.winprobability?.at?.(-1)?.homeWinPercentage;
  return {
    teams,
    state: comp.status?.type?.state ?? "pre",
    detail: comp.status?.type?.shortDetail ?? "",
    homeWinPct: typeof wp === "number" ? wp : undefined,
  };
}

// Team box-score stats by ESPN's stat `name`, keyed by team id.
function teamStats(data: any): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const t of data.boxscore?.teams ?? []) {
    const id = String(t.team?.id);
    out[id] = {};
    for (const s of t.statistics ?? []) out[id][s.name] = s.displayValue;
  }
  return out;
}

// ---------- football (NFL + NCAAF) ----------

export interface FootballState extends LiveCommon {
  kind: "football";
  // Field position is measured in yards from the HOME team's goal line —
  // that's what ESPN's play `yardLine` means (verified: "SF 40" -> 40 and
  // "WSH 46" -> 54 in a WSH @ SF game). The display draws the home end zone
  // on the left so this maps straight onto x.
  ball?: number;
  firstDown?: number; // same axis; equals the goal line on goal-to-go
  driveStart?: number;
  down?: number;
  distance?: number;
  goalToGo?: boolean;
  redZone?: boolean;
  possessionId?: string;
  attackingHomeGoal?: boolean;
  downText?: string; // "3rd & 2"
  spotText?: string; // "SF 40"
  driveSummary?: string;
  lastPlay?: string;
}

const ORD = ["", "1st", "2nd", "3rd", "4th"];

export function mapFootball(data: any): FootballState {
  const common = commonFrom(data);
  const out: FootballState = { kind: "football", ...common };
  const drive = data.drives?.current ?? data.drives?.previous?.at?.(-1);
  const plays: any[] = drive?.plays ?? [];
  const last = plays.at(-1);
  if (!last) return out;

  // `end` is the spot after the most recent play, i.e. the next snap.
  // Kickoffs/PATs/end-of-period markers carry down 0 — there's no line to
  // gain then, so only the ball spot is drawn.
  const spot = last.end ?? last.start ?? {};
  const home = common.teams.find((t) => t.homeAway === "home");
  out.possessionId = spot.team?.id ? String(spot.team.id) : last.start?.team?.id ? String(last.start.team.id) : undefined;
  out.lastPlay = last.text;
  out.driveSummary = drive?.description;
  if (typeof drive?.start?.yardLine === "number") out.driveStart = drive.start.yardLine;

  if (typeof spot.yardLine !== "number") return out;
  out.ball = spot.yardLine;
  out.spotText = spot.possessionText;

  // Which goal the offense attacks: yardsToEndzone == yardLine means it's
  // heading for the home goal (x = 0). Falls back to home/away when the
  // ball sits exactly on the 50 and both readings agree.
  const toGo = spot.yardsToEndzone;
  out.attackingHomeGoal =
    typeof toGo === "number" && toGo !== 50 ? Math.abs(spot.yardLine - toGo) < 0.5 : out.possessionId !== home?.id;
  if (typeof toGo === "number") out.redZone = toGo > 0 && toGo <= 20;

  if (spot.down > 0 && typeof spot.distance === "number") {
    out.down = spot.down;
    out.distance = spot.distance;
    out.goalToGo = typeof toGo === "number" && spot.distance >= toGo;
    const target = out.attackingHomeGoal ? 0 : 100;
    out.firstDown = out.goalToGo ? target : out.attackingHomeGoal ? spot.yardLine - spot.distance : spot.yardLine + spot.distance;
    out.downText = `${ORD[spot.down] ?? spot.down} & ${out.goalToGo ? "Goal" : spot.distance}`;
  }
  return out;
}

// ---------- basketball ----------

export interface BasketballState extends LiveCommon {
  kind: "basketball";
  // ESPN shot coordinates are half-court feet: x across the 50 ft width,
  // y out from the baseline (seen 0..28 in a live game). Free throws carry
  // a -214748340 sentinel instead of a real spot, so they're dropped here.
  shots: { x: number; y: number; made: boolean; teamId: string; three: boolean }[];
  recent: string[];
  stats: Record<string, Record<string, string>>;
}

export function mapBasketball(data: any): BasketballState {
  const plays: any[] = data.plays ?? [];
  const shots = plays
    .filter((p) => p.shootingPlay && p.coordinate && p.coordinate.x > -1000 && p.coordinate.y > -1000)
    .map((p) => ({
      x: p.coordinate.x,
      y: p.coordinate.y,
      made: Boolean(p.scoringPlay),
      teamId: String(p.team?.id ?? ""),
      three: /three point/i.test(p.text ?? "") || p.scoreValue === 3,
    }));
  return {
    kind: "basketball",
    ...commonFrom(data),
    shots,
    recent: plays.slice(-3).reverse().map((p) => p.text).filter(Boolean),
    stats: teamStats(data),
  };
}

// ---------- hockey ----------

export interface HockeyState extends LiveCommon {
  kind: "hockey";
  // Rink coordinates in feet from centre ice: x -100..100, y -42.5..42.5.
  // Teams switch ends each period, so shots are normalised here so the home
  // team always shoots at the right-hand net and the away team at the left.
  shots: { x: number; y: number; goal: boolean; teamId: string }[];
  powerPlayTeamId?: string;
  lastGoal?: string;
  recent: string[];
  stats: Record<string, Record<string, string>>;
}

const HOCKEY_SHOT_TYPES = new Set(["Shot", "Goal", "Missed"]);

export function mapHockey(data: any): HockeyState {
  const common = commonFrom(data);
  const homeId = common.teams.find((t) => t.homeAway === "home")?.id;
  const plays: any[] = data.plays ?? [];
  const shots = plays
    .filter((p) => HOCKEY_SHOT_TYPES.has(p.type?.text) && p.coordinate)
    .map((p) => {
      const teamId = String(p.team?.id ?? "");
      const wantRight = teamId === homeId;
      const flip = wantRight ? p.coordinate.x < 0 : p.coordinate.x > 0;
      return { x: flip ? -p.coordinate.x : p.coordinate.x, y: flip ? -p.coordinate.y : p.coordinate.y, goal: p.type.text === "Goal", teamId };
    });

  // Every play carries a `strength` relative to its own team. The latest
  // play's reading is the current state: "power-play" means that team is
  // on it, "short-handed" means the other team is.
  let powerPlayTeamId: string | undefined;
  const lastWithStrength = [...plays].reverse().find((p) => p.strength?.abbreviation);
  if (lastWithStrength) {
    const teamId = String(lastWithStrength.team?.id ?? "");
    const other = common.teams.find((t) => t.id !== teamId)?.id;
    if (lastWithStrength.strength.abbreviation === "power-play") powerPlayTeamId = teamId;
    else if (lastWithStrength.strength.abbreviation === "short-handed") powerPlayTeamId = other;
  }

  return {
    kind: "hockey",
    ...common,
    shots,
    powerPlayTeamId: common.state === "in" ? powerPlayTeamId : undefined,
    lastGoal: [...plays].reverse().find((p) => p.type?.text === "Goal")?.text,
    recent: plays.slice(-3).reverse().map((p) => p.text).filter(Boolean),
    stats: teamStats(data),
  };
}

// ---------- baseball ----------

export interface BaseballState extends LiveCommon {
  kind: "baseball";
  inning?: string; // "Top 7th"
  balls: number;
  strikes: number;
  outs: number;
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  matchup?: string; // "Parker Messick pitches to Yandy Diaz"
  // ESPN gamecast pixel space, not real units. A box of x 82..145 and
  // y 146..194 separated called strikes from balls 95% of the time across
  // 541 pitches from recent games, so the display draws its zone there.
  pitches: { x: number; y: number; mph?: number; type?: string; result: string }[];
  lastPlay?: string;
}

// Plays that close out an at-bat or half-inning — once one of these is the
// latest play, the count on it belongs to the batter who just finished.
const AT_BAT_OVER = new Set(["End Batter/Pitcher", "End Inning", "Start Inning"]);

export function mapBaseball(data: any): BaseballState {
  const plays: any[] = data.plays ?? [];
  const last = plays.at(-1);
  const atBatOver = !last || AT_BAT_OVER.has(last.type?.text);
  const atBatId = last?.atBatId;
  const pitches = atBatOver
    ? []
    : plays
        .filter((p) => p.atBatId === atBatId && p.summaryType === "P" && p.pitchCoordinate)
        .map((p) => ({
          x: p.pitchCoordinate.x,
          y: p.pitchCoordinate.y,
          mph: typeof p.pitchVelocity === "number" ? p.pitchVelocity : undefined,
          type: p.pitchType?.text,
          result: p.type?.text ?? "",
        }));
  const runnerSource = [...plays].reverse().find((p) => p.type?.text !== "End Inning" && p.type?.text !== "Start Inning");
  const inningOver = last?.type?.text === "End Inning";
  return {
    kind: "baseball",
    ...commonFrom(data),
    inning: last?.period ? `${last.period.type} ${last.period.displayValue?.replace(" Inning", "") ?? last.period.number}` : undefined,
    balls: atBatOver ? 0 : last?.resultCount?.balls ?? 0,
    strikes: atBatOver ? 0 : last?.resultCount?.strikes ?? 0,
    outs: inningOver ? 0 : last?.outs ?? 0,
    onFirst: !inningOver && Boolean(runnerSource?.onFirst),
    onSecond: !inningOver && Boolean(runnerSource?.onSecond),
    onThird: !inningOver && Boolean(runnerSource?.onThird),
    matchup: [...plays].reverse().find((p) => p.type?.text === "Start Batter/Pitcher")?.text,
    pitches,
    lastPlay: [...plays].reverse().find((p) => p.type?.text === "Play Result")?.text,
  };
}

export type EspnLiveState = FootballState | BasketballState | HockeyState | BaseballState;

export function mapEspnSummary(sport: string, data: any): EspnLiveState {
  if (sport === "nfl" || sport === "ncaaf") return mapFootball(data);
  if (sport === "nba") return mapBasketball(data);
  if (sport === "nhl") return mapHockey(data);
  return mapBaseball(data);
}
