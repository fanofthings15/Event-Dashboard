export interface EsportsGame {
  slug: string; // PandaScore's videogame slug
  sport: string; // internal sport key used on NormalizedEvent
  label: string; // display name
  color: string; // hex accent color
}

// Add more entries here to make a title available to enable in Settings —
// nothing else needs to change for a new title to show up as a toggle.
export const ESPORTS_CATALOG: EsportsGame[] = [
  { slug: "csgo", sport: "cs2", label: "Counter-Strike 2", color: "#a855f7" },
  { slug: "lol", sport: "lol", label: "League of Legends", color: "#eab308" },
  { slug: "rl", sport: "rocket-league", label: "Rocket League", color: "#06b6d4" },
  { slug: "valorant", sport: "valorant", label: "Valorant", color: "#f43f5e" },
  { slug: "overwatch", sport: "overwatch", label: "Overwatch 2", color: "#22c55e" },
  { slug: "dota2", sport: "dota2", label: "Dota 2", color: "#dc2626" },
  { slug: "r6siege", sport: "r6siege", label: "Rainbow Six Siege", color: "#0ea5e9" },
];

export const DEFAULT_ENABLED_SLUGS = ["csgo", "lol", "rl"];

export function catalogEntry(slug: string): EsportsGame | undefined {
  return ESPORTS_CATALOG.find((g) => g.slug === slug);
}
