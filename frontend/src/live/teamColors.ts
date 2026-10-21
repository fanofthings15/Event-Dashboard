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
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const isHex = (c?: string): c is string => Boolean(c && /^#?[0-9a-fA-F]{6}$/.test(c));
const withHash = (c: string) => (c.startsWith("#") ? c : `#${c}`);

// ESPN's primary colours are often near-black (Spurs "000000", Kraken
// "000d33"), which vanish on the display's dark background — fall back to
// the alternate, or lift the primary toward white if neither reads. A
// near-white alternate (Lightning navy/"ffffff") is skipped too: white is
// what the views use for neutral markings, so a white team reads as no team.
function readable(team: LiveTeam): string[] {
  const options = [team.color, team.altColor].filter(isHex).map(withHash);
  const good = options.filter((c) => luminance(c) >= 0.05 && luminance(c) <= 0.8);
  if (good.length) return good;
  return [lighten(options[0] ?? "#888888", 0.45)];
}

// One colour per team, readable on the dark display and distinct from each
// other — the second team switches to its alternate when the two clash.
export function teamColors(away: LiveTeam | undefined, home: LiveTeam | undefined): [string, string] {
  const a = away ? readable(away) : ["#4f8dfd"];
  const h = home ? readable(home) : ["#ef4444"];
  const awayColor = a[0];
  const homeColor = h.find((c) => distance(c, awayColor) > 90) ?? (distance(h[0], awayColor) > 90 ? h[0] : lighten(h[0], 0.5));
  return [awayColor, homeColor];
}
