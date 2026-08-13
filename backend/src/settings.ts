import fs from "fs";
import path from "path";
import os from "os";

const SETTINGS_DIR = path.join(os.homedir(), ".event-dashboard");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

export interface Settings {
  pandaScoreApiKey: string;
  // Team/driver names to filter the feed down to what's actually followed.
  // Empty array = show everything.
  followedTeams: string[];
}

const DEFAULTS: Settings = { pandaScoreApiKey: "", followedTeams: [] };

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
