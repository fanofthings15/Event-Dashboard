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
}

const DEFAULTS: Settings = {
  pandaScoreApiKey: "",
  tbaApiKey: "",
  frcTeamKey: "",
  frcFollowEnabled: false,
  excludedLeagues: [],
  disabledCoreSources: [],
  enabledEsportsGames: DEFAULT_ENABLED_SLUGS,
  customEvents: [],
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
