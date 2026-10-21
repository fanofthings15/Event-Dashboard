// Mirrors backend/src/liveEspn.ts, backend/src/f1Live.ts and the FRC
// response in backend/src/routes/live.ts — see those for what each field
// means and how it was verified.

export interface LiveTeam {
  id: string;
  homeAway: "home" | "away";
  abbr: string;
  name: string;
  color?: string;
  altColor?: string;
  logo?: string;
  score: string;
  record?: string;
  linescores: string[];
  timeoutsRemaining?: number;
  hits?: number;
  errors?: number;
}

interface LiveCommon {
  teams: LiveTeam[]; // [away, home]
  state: "pre" | "in" | "post";
  detail: string;
  period?: number;
  clock?: string;
  homeWinPct?: number;
}

export interface FootballState extends LiveCommon {
  kind: "football";
  ball?: number; // yards from the home goal line
  firstDown?: number;
  driveStart?: number;
  down?: number;
  distance?: number;
  goalToGo?: boolean;
  redZone?: boolean;
  possessionId?: string;
  attackingHomeGoal?: boolean;
  downText?: string;
  spotText?: string;
  driveSummary?: string;
  lastPlay?: string;
  motion?: { id: string; type: string; from: number; to: number; towardHome: boolean; lane: "left" | "middle" | "right"; depth?: "short" | "deep" };
}

export interface BasketballState extends LiveCommon {
  kind: "basketball";
  shots: { x: number; y: number; made: boolean; teamId: string; three: boolean }[];
  recent: string[];
  stats: Record<string, Record<string, string>>;
}

export interface HockeyState extends LiveCommon {
  kind: "hockey";
  shots: { x: number; y: number; goal: boolean; blocked: boolean; missed: boolean; teamId: string; last?: boolean }[];
  faceoff?: { x: number; y: number; winnerId: string };
  powerPlayTeamId?: string;
  powerPlaySecondsLeft?: number;
  lastGoal?: string;
  recent: string[];
  stats: Record<string, Record<string, string>>;
}

export interface BaseballState extends LiveCommon {
  kind: "baseball";
  inning?: string;
  balls: number;
  strikes: number;
  outs: number;
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  matchup?: string;
  pitches: { x: number; y: number; mph?: number; type?: string; result: string }[];
  lastPlay?: string;
  fence?: { venue: string; leftLine: number; left: number; leftCenter: number; center: number; rightCenter: number; right?: number; rightLine: number };
  hits?: { id: string; x: number; y: number; speed?: number; angle?: number; distance?: number; trajectory?: string; result?: string; out?: boolean; throws?: ("home" | "1B" | "2B" | "3B")[]; runners?: { from: "home" | "1B" | "2B" | "3B"; to: "home" | "1B" | "2B" | "3B"; out: boolean }[] }[];
}

export interface F1Driver {
  number: string;
  tla: string;
  team: string;
  color: string;
  position: number;
  gap?: string;
  interval?: string;
  inPit: boolean;
  out: boolean;
  compound?: string;
  stops: number;
  x?: number;
  y?: number;
}

export interface F1State {
  kind: "f1";
  connected: boolean;
  error?: string;
  session?: { meeting: string; name: string; status: string };
  trackStatus?: { code: string; message: string };
  lap?: { current: number; total: number };
  drivers: F1Driver[];
  yellowSectors: number[];
  raceControl: { utc: string; message: string; flag?: string }[];
  circuit?: { x: number[]; y: number[]; rotation: number; marshalSectors: { number: number; x: number; y: number }[] } | null;
  positionsAvailable: boolean;
  pitStops?: { number: string; tla: string; color: string; lap: number; from?: string; to?: string; seconds?: number }[];
}

export interface FrcAlliance {
  teams: string[];
  score?: number;
}

export interface FrcState {
  kind: "frc";
  error?: string;
  eventName?: string;
  quals?: number;
  last?: { label: string; red: FrcAlliance; blue: FrcAlliance; winner?: string };
  onField?: { label: string; red: FrcAlliance; blue: FrcAlliance; time?: number };
  myTeam?: {
    number: string;
    rank?: number;
    record?: string;
    rankedTeams?: number;
    next?: { label: string; alliance: "red" | "blue"; time?: number };
  };
  rankings?: { rank: number; team: string; record?: string }[];
}
