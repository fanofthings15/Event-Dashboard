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
  nickname?: string; // "Bruins" — what the display labels a team with
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
  period?: number;
  clock?: string; // time left in the period, e.g. "12:59"
  homeWinPct?: number;
}

function commonFrom(data: any): LiveCommon {
  const comp = data.header?.competitions?.[0] ?? {};
  const teams: LiveTeam[] = (comp.competitors ?? []).map((c: any) => ({
    id: String(c.id ?? c.team?.id),
    homeAway: c.homeAway,
    abbr: c.team?.abbreviation ?? "",
    name: c.team?.displayName ?? c.team?.name ?? "",
    nickname: c.team?.name && c.team.name !== c.team?.location ? c.team.name : undefined,
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
    period: typeof comp.status?.period === "number" ? comp.status.period : undefined,
    clock: comp.status?.displayClock ?? undefined,
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
  lastPlayIsMotion?: boolean; // lastPlay is the play in `motion` (not a timeout or end-of-game marker after it)
  timeoutsPerHalf?: number; // for drawing used/left timeouts
  nextHash?: Hash; // where the next snap sits
  // The latest play, for animating it on the field. ESPN gives no catch or
  // ball location, so passes and runs are placed from the play's start and
  // end spots plus the direction words in its text ("pass deep left", "up
  // the middle").
  motion?: {
    id: string;
    type: string; // ESPN play type, e.g. "Pass Reception", "Rush", "Sack", "Punt"
    from: number; // yards from the home goal line
    to: number;
    towardHome: boolean; // offense heading for the home goal
    lane: "left" | "middle" | "right";
    depth?: "short" | "deep";
    // The play call as the text names it: "(Shotgun)" / "(Pistol)" or under
    // centre, the run gap ("left guard", "up the middle", "right end"), a QB
    // scramble, and a carrier who ended out of bounds.
    formation?: "shotgun" | "pistol" | "under center";
    gap?: "end" | "tackle" | "guard" | "middle";
    scramble?: boolean;
    outOfBounds?: boolean;
    hash?: Hash; // where the ball was snapped from
    pass?: boolean; // a forward pass was thrown on the play
    kickYards?: number; // punts and kickoffs: distance in the air, from "punts 56 yards" / "kicks 63 yards"
    fumbleAt?: number; // where the ball came loose (yards from home goal)
    turnover?: boolean; // the other team ended up with the ball
    // The try after a touchdown — ESPN folds it into the touchdown play
    // (`pointAfterAttempt`, "Extra Point Good") rather than sending its own.
    pat?: { kick: boolean; good: boolean };
  };
}

const ORD = ["", "1st", "2nd", "3rd", "4th"];

// A hash as drawn: the field has the away end zone on the left, so "top" is
// the offense's left when it's heading for the home goal.
type Hash = "top" | "middle" | "bottom";

// The part of a play's text that describes the play itself — before any
// penalty and without the tacklers in brackets (a formation tag is kept).
const playCall = (text: string) => text.split(/PENALTY/i)[0].replace(/\((?!shotgun|pistol|no huddle)[^)]*\)/gi, "");

// Offense's left/right from "pass short left", "left tackle", "scrambles right end".
function laneOf(text: string): "left" | "middle" | "right" {
  const call = playCall(text);
  return /\bleft\b/i.test(call) ? "left" : /\bright\b/i.test(call) ? "right" : "middle";
}

export function mapFootball(data: any): FootballState {
  const common = commonFrom(data);
  const out: FootballState = { kind: "football", ...common };
  // ESPN sends football timeouts as `timeoutsUsed`, counted per half (it
  // read 0 for both teams in the 3rd quarter after each used two before
  // halftime), and only while the game is on. Three a half; overtime is two
  // each in the NFL, one per period in college.
  const comp = data.header?.competitions?.[0] ?? {};
  const period = comp.status?.period ?? 0;
  const perHalf = period >= 5 ? (/college/i.test(data.header?.league?.slug ?? "") ? 1 : 2) : 3;
  out.timeoutsPerHalf = perHalf;
  for (const c of comp.competitors ?? []) {
    const t = out.teams.find((x) => x.id === String(c.id ?? c.team?.id));
    if (t && t.timeoutsRemaining === undefined && typeof c.timeoutsUsed === "number" && common.state === "in") t.timeoutsRemaining = Math.max(0, perHalf - c.timeoutsUsed);
  }
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

  // A play's offense is heading for the home goal when yardsToEndzone ==
  // yardLine; on the 50 both readings agree, so fall back to home/away.
  const headingHome = (st: any) =>
    typeof st.yardsToEndzone === "number" && st.yardsToEndzone !== 50 ? Math.abs(st.yardLine - st.yardsToEndzone) < 0.5 : String(st.team?.id ?? "") !== home?.id;
  // Each play leaves the ball on the hash of the side it went to; kicks
  // reset to the middle, and incompletions, penalties and stoppages leave it
  // where it was. hashes[i] is where the snap after play i sits.
  const hashes: Hash[] = [];
  let h: Hash = "middle";
  for (const p of plays) {
    const type: string = p.type?.text ?? "";
    if (/kickoff|punt|field goal|extra point|two-point/i.test(type)) h = "middle";
    else if (!/incompletion|penalty|timeout|end of|two-minute/i.test(type) && typeof p.start?.yardLine === "number") {
      const lane = laneOf(p.text ?? "");
      const towardHome = headingHome(p.start);
      h = lane === "middle" ? "middle" : (lane === "left") === towardHome ? "top" : "bottom";
    }
    hashes.push(h);
  }
  out.nextHash = hashes.at(-1);

  // The play just run, for the field animation — stoppages (timeouts,
  // end of a quarter) don't replace it.
  let runIdx = plays.length - 1;
  while (runIdx > 0 && /timeout|end of|end game|two-minute|end period|end quarter/i.test(plays[runIdx].type?.text ?? "")) runIdx--;
  out.lastPlayIsMotion = runIdx === plays.length - 1;
  const run = plays[runIdx];
  const s0 = run?.start ?? {};
  if (run && typeof s0.yardLine === "number" && run.type?.text) {
    const last = run;
    const towardHome = headingHome(s0);
    const text: string = last.text ?? "";
    const forward = (yds: number) => s0.yardLine + (towardHome ? -yds : yds);
    // statYardage is 0 on turnovers and kicks, but end.yardLine stays the
    // true spot (yards from the home goal) through a change of possession.
    const kickOrTurnover = /punt|kickoff|interception|fumble|muff/i.test(last.type.text);
    const gained = typeof last.statYardage === "number" && !kickOrTurnover ? last.statYardage : undefined;
    const endSpot = gained !== undefined ? forward(gained) : last.end?.yardLine;
    // The gain before a fumble ("to WAS 21 for 12 yards ... FUMBLES") is
    // where the ball came loose.
    const beforeFumble = text.split(/FUMBLES/i)[0];
    const fumbleGain = /FUMBLES/i.test(text) ? (beforeFumble.match(/for (-?\d+) yards?/i)?.[1] ?? (/for no gain/i.test(beforeFumble) ? "0" : undefined)) : undefined;
    const kickYards = text.match(/(?:punts|kicks) (\d+) yards?/i)?.[1];
    const endTeam = last.end?.team?.id ?? last.end?.team;
    const startTeam = s0.team?.id ?? s0.team;
    const lane = laneOf(text);
    const call = playCall(text);
    const gap = call.match(/\b(?:left|right) (end|tackle|guard)\b/i)?.[1]?.toLowerCase() as "end" | "tackle" | "guard" | undefined;
    const hash = hashes[runIdx - 1] ?? "middle";
    out.motion = {
      id: String(last.id ?? `${s0.yardLine}-${last.text}`),
      type: last.type.text,
      from: s0.yardLine,
      to: Math.max(-10, Math.min(110, typeof endSpot === "number" ? endSpot : s0.yardLine)),
      towardHome,
      lane,
      depth: /\bdeep\b/i.test(call) ? "deep" : /\bshort\b/i.test(call) ? "short" : undefined,
      formation: /shotgun/i.test(text) ? "shotgun" : /pistol/i.test(text) ? "pistol" : "under center",
      gap: gap ?? (/up the middle/i.test(call) ? "middle" : undefined),
      scramble: /scrambles/i.test(call) || undefined,
      outOfBounds: /\b(?:pushed|ran|runs|stepped) ob\b|out of bounds/i.test(call) || undefined,
      hash,
      pass: / pass /i.test(` ${text} `) && !/pass (?:attempt )?(?:is )?(?:blocked|aborted)/i.test(text),
      kickYards: kickYards ? Number(kickYards) : undefined,
      fumbleAt: fumbleGain !== undefined ? forward(Number(fumbleGain)) : undefined,
      pat: run.pointAfterAttempt?.text
        ? { kick: /extra point/i.test(run.pointAfterAttempt.text), good: /good/i.test(run.pointAfterAttempt.text) && !/no good/i.test(run.pointAfterAttempt.text) }
        : undefined,
      turnover: Boolean(endTeam && startTeam && String(endTeam) !== String(startTeam) && !/punt|kickoff/i.test(last.type.text)) || /interception|\(opponent\)|opp fumble/i.test(last.type.text),
    };
  }

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
  // Teams switch ends each period, so every play is normalised here so the
  // home team always attacks the right-hand net. Blocked attempts are
  // included (a block is a new shot on TV), and the latest attempt of any
  // kind is flagged for highlighting.
  shots: { x: number; y: number; goal: boolean; blocked: boolean; missed: boolean; teamId: string; last?: boolean }[];
  // Nothing public tracks the puck live. The one moment its position is
  // known exactly is a faceoff, so this is set only while the most recent
  // play is a faceoff — the dot it was taken on, and who won it.
  faceoff?: { x: number; y: number; winnerId: string };
  powerPlayTeamId?: string;
  // Seconds of power play left when this response was built. ESPN gives no
  // penalty length or PP clock, so it's worked out from the penalty that
  // started it: a minor is 2:00, a major/fighting 5:00, counted from that
  // play's game time to the current clock.
  powerPlaySecondsLeft?: number;
  lastGoal?: string;
  recent: string[];
  stats: Record<string, Record<string, string>>;
}

const HOCKEY_SHOT_TYPES = new Set(["Shot", "Goal", "Missed"]);
const HOCKEY_NON_PENALTY = new Set([
  "Shot", "Goal", "Missed", "Blocked", "Face Off", "Hit", "Giveaway", "Takeaway", "Stoppage",
  "Period Start", "Period End", "Game End", "Shootout", "Penalty Shot", "Challenge", "Official Challenge",
]);
const mmss = (s: string) => {
  const [m, sec] = s.split(":").map(Number);
  return (m || 0) * 60 + (sec || 0);
};
// NHL regular-season periods: three of 20 minutes, then 5-minute overtime.
const periodLength = (p: number) => (p <= 3 ? 1200 : 300);
const gameSeconds = (period: number, elapsedInPeriod: number) => {
  let t = 0;
  for (let p = 1; p < period; p++) t += periodLength(p);
  return t + elapsedInPeriod;
};
const HOCKEY_ATTEMPT_TYPES = new Set([...HOCKEY_SHOT_TYPES, "Blocked"]);

export function mapHockey(data: any): HockeyState {
  const common = commonFrom(data);
  const homeId = common.teams.find((t) => t.homeAway === "home")?.id;
  const plays: any[] = data.plays ?? [];
  const located = plays.filter((p) => p.coordinate && typeof p.coordinate.x === "number");

  // Which end the home team attacks in each period, read off where its
  // shots were taken (a team's shots cluster at the net it attacks). With no
  // home shots yet in a period, the away team's shots answer it instead;
  // with neither, ends alternate from period 1. Every located play in a
  // period gets the same flip, so non-shot plays (hits, giveaways) land on
  // the right side too — flipping each shot by its own x got stray shots
  // from a team's own zone wrong.
  const lean = new Map<number, number>();
  for (const p of located) {
    if (!HOCKEY_SHOT_TYPES.has(p.type?.text)) continue;
    const period = p.period?.number ?? 1;
    const sign = String(p.team?.id ?? "") === homeId ? 1 : -1;
    lean.set(period, (lean.get(period) ?? 0) + sign * p.coordinate.x);
  }
  const homeAttacksRight = (period: number): boolean => {
    const v = lean.get(period);
    if (v !== undefined && v !== 0) return v > 0;
    const p1 = lean.get(1);
    const p1Right = p1 === undefined || p1 >= 0;
    return period % 2 === 1 ? p1Right : !p1Right;
  };
  const place = (p: any) => {
    const flip = !homeAttacksRight(p.period?.number ?? 1);
    return { x: flip ? -p.coordinate.x : p.coordinate.x, y: flip ? -p.coordinate.y : p.coordinate.y };
  };

  const shots: HockeyState["shots"] = located
    .filter((p) => HOCKEY_ATTEMPT_TYPES.has(p.type?.text))
    .map((p) => ({ ...place(p), goal: p.type.text === "Goal", blocked: p.type.text === "Blocked", missed: p.type.text === "Missed", teamId: String(p.team?.id ?? "") }));
  if (shots.length) shots[shots.length - 1].last = true;

  // Faceoff coordinates snap to the real dots (±69,±22 end zones, ±20,±22
  // neutral zone). Centre-ice faceoffs — after goals and period starts —
  // come with no coordinate at all (ESPN drops a 0,0), so a missing one
  // means centre ice. The faceoff play's team is the one that won it.
  const latest = [...plays].reverse().find((p) => p.type?.text !== "Period Start");
  let faceoff: HockeyState["faceoff"];
  if (latest?.type?.text === "Face Off") {
    const at = latest.coordinate && typeof latest.coordinate.x === "number" ? latest : { ...latest, coordinate: { x: 0, y: 0 } };
    faceoff = { ...place(at), winnerId: String(latest.team?.id ?? "") };
  }

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

  // Penalty plays are every play type that isn't ordinary hockey action.
  let powerPlaySecondsLeft: number | undefined;
  if (common.state === "in" && powerPlayTeamId && common.period && common.clock) {
    const shorthanded = common.teams.find((t) => t.id !== powerPlayTeamId)?.id;
    const penalty = [...plays].reverse().find((p) => String(p.team?.id ?? "") === shorthanded && !HOCKEY_NON_PENALTY.has(p.type?.text));
    if (penalty?.period?.number && penalty.clock?.displayValue) {
      const length = /major|fighting/i.test(`${penalty.type?.text} ${penalty.text}`) ? 300 : /double minor/i.test(penalty.text ?? "") ? 240 : 120;
      const start = gameSeconds(penalty.period.number, mmss(penalty.clock.displayValue));
      const now = gameSeconds(common.period, periodLength(common.period) - mmss(common.clock));
      const left = start + length - now;
      if (left > 0 && left <= length) powerPlaySecondsLeft = left;
    }
  }

  return {
    kind: "hockey",
    ...common,
    powerPlaySecondsLeft,
    shots,
    faceoff: common.state === "in" ? faceoff : undefined,
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
  // From MLB's Stats API (liveMlb.ts), filled in by the route when the game
  // can be matched there: the ballpark's real fence, and every batted ball.
  fence?: import("./liveMlb.js").Fence;
  hits?: import("./liveMlb.js").Hit[];
  // Used only to match the game in the Stats API.
  startTime?: string;
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
    startTime: data.header?.competitions?.[0]?.date,
  };
}

export type EspnLiveState = FootballState | BasketballState | HockeyState | BaseballState;

export function mapEspnSummary(sport: string, data: any): EspnLiveState {
  if (sport === "nfl" || sport === "ncaaf") return mapFootball(data);
  if (sport === "nba") return mapBasketball(data);
  if (sport === "nhl") return mapHockey(data);
  return mapBaseball(data);
}
