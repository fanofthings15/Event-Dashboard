import type { LiveTeam } from "./liveTypes";

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex).map((v) => Math.round(v + (255 - v) * amount));
  return toHex(r, g, b);
}

const toHex = (r: number, g: number, b: number) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex(...([r, g, b].map((v) => Math.round((v + m) * 255)) as [number, number, number]));
}

// Brighten a dark colour just until it reads, keeping its hue and
// saturation — mixing in white instead turns navy and midnight green gray.
function lift(hex: string, target = 0.1): string {
  const [h, s, l0] = hsl(hex);
  if (luminance(hex) >= target) return hex;
  for (let l = l0; l < 0.95; l += 0.01) {
    const c = fromHsl(h, s, l);
    if (luminance(c) >= target) return c;
  }
  return lighten(hex, 0.45);
}

const isGray = (hex: string) => hsl(hex)[1] < 0.2;

const isHex = (c?: string): c is string => Boolean(c && /^#?[0-9a-fA-F]{6}$/.test(c));
const withHash = (c: string) => (c.startsWith("#") ? c : `#${c}`);

// ESPN's primary colours are often too dark for the display's background
// (Spurs "000000", Kraken "000d33", Cowboys navy "002a5c"). Use the
// alternate if it reads and is a real colour; a silver or gray alternate
// (Cowboys "b0b7bc") loses to the primary brightened, so the Cowboys stay
// blue and the Eagles' midnight green stays green. A near-white alternate
// (Lightning navy/"ffffff") is skipped too: white is what the views use for
// neutral markings, so a white team reads as no team.
function readable(team: LiveTeam): string[] {
  const options = [team.color, team.altColor].filter(isHex).map(withHash);
  const colourful = options.filter((c) => !isGray(c));
  const good = options.filter((c) => luminance(c) >= 0.05 && luminance(c) <= 0.8 && (colourful.length === 0 || !isGray(c)));
  if (good.length) return good;
  return [lift(colourful[0] ?? options[0] ?? "#888888")];
}

// One colour per team, readable on the dark display and distinct from each
// other — the second team switches to its alternate when the two clash.
// Two colours tell apart if they're far apart in RGB, or are both real
// colours with clearly different hues (teal vs navy is only ~75 apart in RGB).
function distinct(a: string, b: string): boolean {
  if (distance(a, b) > 90) return true;
  const [ha, sa] = hsl(a);
  const [hb, sb] = hsl(b);
  const gap = Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb));
  return sa >= 0.2 && sb >= 0.2 && gap >= 20;
}

export function teamColors(away: LiveTeam | undefined, home: LiveTeam | undefined): [string, string] {
  const a = away ? readable(away) : ["#4f8dfd"];
  const h = home ? readable(home) : ["#ef4444"];
  const awayColor = a[0];
  // still too close: brighten the home colour (same hue) until they part
  const homeColor =
    h.find((c) => distinct(c, awayColor)) ??
    [0.2, 0.3, 0.45].map((t) => lift(h[0], t)).find((c) => distinct(c, awayColor)) ??
    lighten(h[0], 0.5);
  return [awayColor, homeColor];
}

// How the display names a team: the nickname ("Bruins", "Patriots"), falling
// back to the abbreviation. Narrow stat-table columns keep the abbreviation.
export function teamLabel(t: { nickname?: string; abbr?: string } | undefined): string {
  return t?.nickname || t?.abbr || "";
}
