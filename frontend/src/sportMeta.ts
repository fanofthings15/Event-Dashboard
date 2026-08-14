import type { NormalizedEvent } from "./types";
import { CORE_SPORT_META, CUSTOM_FALLBACK_COLOR } from "./types";
import type { EsportsGame } from "./settingsTypes";

export function sportMeta(
  e: NormalizedEvent,
  catalog: EsportsGame[],
  overrides: Record<string, string> = {}
): { label: string; color: string } {
  if (e.sport === "custom") {
    return { label: e.league || "Custom", color: e.color || CUSTOM_FALLBACK_COLOR };
  }
  const override = overrides[e.sport];
  if (CORE_SPORT_META[e.sport]) return { ...CORE_SPORT_META[e.sport], color: override || CORE_SPORT_META[e.sport].color };
  const fromCatalog = catalog.find((g) => g.sport === e.sport);
  if (fromCatalog) return { label: fromCatalog.label, color: override || fromCatalog.color };
  return { label: e.sport, color: override || e.color || CUSTOM_FALLBACK_COLOR };
}
