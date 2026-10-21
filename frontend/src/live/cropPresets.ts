import type { CropRect } from "../settingsTypes";

// Where the minimap usually sits in each title's broadcast, as fractions of
// the 16:9 frame. These are starting guesses — every league lays its
// broadcast out a little differently, so the display's calibrate mode (press
// C) saves a corrected rect per league into settings.liveCropPresets.
export const DEFAULT_CROPS: Record<string, CropRect> = {
  lol: { x: 0.79, y: 0.635, w: 0.205, h: 0.365 },
  cs2: { x: 0.0, y: 0.0, w: 0.2, h: 0.355 },
  valorant: { x: 0.01, y: 0.02, w: 0.19, h: 0.34 },
};

// Titles whose broadcasts have nothing worth cropping — shown as a series
// view with the whole stream instead.
export const SERIES_SPORTS = new Set(["rocket-league", "overwatch", "r6siege"]);

export const cropKey = (sport: string, league: string) => `${sport}:${league}`;

export function cropFor(presets: Record<string, CropRect>, sport: string, league: string): CropRect | undefined {
  return presets[cropKey(sport, league)] ?? presets[sport] ?? DEFAULT_CROPS[sport];
}
