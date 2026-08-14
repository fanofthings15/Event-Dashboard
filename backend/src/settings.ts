import fs from "fs";
import path from "path";
import os from "os";
import { DEFAULT_ENABLED_SLUGS } from "./esportsCatalog.js";

const SETTINGS_DIR = path.join(os.homedir(), ".event-dashboard");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

export interface CustomEvent {
  id: string;
  name: string;
  league: string;
  color: string; // hex
  startTime: string; // ISO 8601
  durationMinutes: number; // used to compute live/upcoming/finished
  url?: string;
}

export interface Settings {
  pandaScoreApiKey: string;
  tbaApiKey: string; // The Blue Alliance Read API key, for FRC events
  frcTeamKey: string; // e.g. "frc254"
  // Whether to actually tag events where frcTeamKey is competing — lets the
  // team key be saved without immediately turning tagging on/off.
  frcFollowEnabled: boolean;
  // State/province codes (e.g. "MI") to show FRC events from. Empty means
  // show every region — this is an include-list, not exclude, since picking
  // 2-3 wanted regions is more natural than excluding everywhere else.
  frcRegions: string[];
  // League names to hide everywhere, matched case-insensitively as a
  // substring (e.g. "LCK Challengers League" hides that specific league
  // without touching the main LCK league).
  excludedLeagues: string[];
  // Core sources (nfl, f1, nba, nhl, frc) the user has turned off entirely.
  disabledCoreSources: string[];
  // PandaScore game slugs currently pulled (see esportsCatalog.ts for the
  // full list of what's available to enable).
  enabledEsportsGames: string[];
  customEvents: CustomEvent[];
  // Per-sport color overrides (sport key -> hex), layered on top of the
  // built-in defaults so a user can fix any pair they still find too close.
  sportColorOverrides: Record<string, string>;
  // Team names to watch across every sport (not just FRC) — matched against
  // each event's team list to set the same "followed" badge FRC uses.
  favoriteTeams: string[];
  // Whether to fire a browser notification when a favorited/followed
  // event goes live.
  notifyOnLive: boolean;
  // How often the frontend polls for new data, in seconds.
  pollIntervalSeconds: number;
  theme: "dark" | "light";
  // When on, /calendar.ics only includes events matching favoriteTeams (or
  // FRC's own followed-team tag) instead of everything currently enabled —
  // for someone who wants their synced calendar limited to specific teams,
  // not just whole sports/leagues.
  icsFavoritesOnly: boolean;
  // Specific events manually followed via the detail view's "Follow event"
  // button — stored as "sport-id" composite keys. Distinct from
  // favoriteTeams (which matches by team name): this is a one-off follow
  // for a single event, not a standing team preference.
  followedEventIds: string[];
  // "followed" = only notify for events matching a favorite team / manual
  // follow (the default, avoids spam); "all" = notify for every live event
  // across every enabled source.
  notifyMode: "followed" | "all";
  // Finished events the user has explicitly dismissed from the Finished
  // view — stored as "sport-id" composite keys, same shape as
  // followedEventIds.
  dismissedFinishedEventIds: string[];
  // Minutes before an event starts to send a heads-up notification, in
  // addition to the at-live one. 0 = no advance reminder, just at-live.
  notifyLeadMinutes: number;
}

const DEFAULTS: Settings = {
  pandaScoreApiKey: "",
  tbaApiKey: "",
  frcTeamKey: "",
  frcFollowEnabled: false,
  frcRegions: [],
  excludedLeagues: [],
  disabledCoreSources: [],
  enabledEsportsGames: DEFAULT_ENABLED_SLUGS,
  customEvents: [],
  sportColorOverrides: {},
  favoriteTeams: [],
  notifyOnLive: false,
  pollIntervalSeconds: 60,
  theme: "dark",
  icsFavoritesOnly: false,
  followedEventIds: [],
  notifyMode: "followed",
  dismissedFinishedEventIds: [],
  notifyLeadMinutes: 0,
};

export function readSettings(): Settings {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function writeSettings(next: Partial<Settings>): Settings {
  const merged = { ...readSettings(), ...next };
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}
