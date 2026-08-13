import type { NormalizedEvent } from "./types";
import { CORE_SPORT_META, CUSTOM_FALLBACK_COLOR } from "./types";
import type { EsportsGame } from "./settingsTypes";

export function sportMeta(e: NormalizedEvent, catalog: EsportsGame[]): { label: string; color: string } {
  if (e.sport === "custom") {
    return { label: e.league || "Custom", color: e.color || CUSTOM_FALLBACK_COLOR };
  }
  if (CORE_SPORT_META[e.sport]) return CORE_SPORT_META[e.sport];
  const fromCatalog = catalog.find((g) => g.sport === e.sport);
  if (fromCatalog) return { label: fromCatalog.label, color: fromCatalog.color };
  return { label: e.sport, color: e.color || CUSTOM_FALLBACK_COLOR };
}
