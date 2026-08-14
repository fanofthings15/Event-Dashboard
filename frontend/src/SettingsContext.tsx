import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { SettingsState } from "./settingsTypes";

const EMPTY: SettingsState = {
  pandaScoreApiKeySet: false,
  tbaApiKeySet: false,
  frcTeamKey: "",
  frcFollowEnabled: false,
  frcRegions: [],
  excludedLeagues: [],
  disabledCoreSources: [],
  enabledEsportsGames: [],
  customEvents: [],
  esportsCatalog: [],
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

interface SettingsContextValue {
  settings: SettingsState;
  loaded: boolean;
  refetch: () => Promise<void>;
  save: (partial: Record<string, unknown>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const r = await fetch("/api/settings");
    const data = (await r.json()) as SettingsState;
    setSettings(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(
    async (partial: Record<string, unknown>) => {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      await refetch();
    },
    [refetch]
  );

  return <SettingsContext.Provider value={{ settings, loaded, refetch, save }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
