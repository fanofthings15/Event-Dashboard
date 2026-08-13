import { useCallback, useEffect, useState } from "react";
import type { SettingsState } from "./settingsTypes";

const EMPTY: SettingsState = {
  pandaScoreApiKeySet: false,
  excludedLeagues: [],
  disabledCoreSources: [],
  enabledEsportsGames: [],
  customEvents: [],
  esportsCatalog: [],
};

export function useSettings() {
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

  return { settings, loaded, refetch, save };
}
