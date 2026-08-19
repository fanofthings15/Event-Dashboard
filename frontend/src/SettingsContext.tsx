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
  notifyLeadMinutes: [],
  notifySoundEnabled: true,
  snoozedEventIds: [],
  compactCards: false,
  timezone: "",
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
    // Two separate backend stores as of the per-user settings split: the
    // bulk of this state is scoped to the requesting user (via the
    // X-authentik-uid header Traefik sets, handled entirely server-side —
    // this fetch doesn't need to know its own identity). The two API keys
    // live behind /api/global-settings instead, admin-gated — a non-admin
    // friend gets a 403 there, which just means the "is a key set" flags
    // fall back to false rather than breaking the rest of settings loading.
    const [userRes, globalRes] = await Promise.all([fetch("/api/settings"), fetch("/api/global-settings")]);
    const userData = await userRes.json();
    const globalData = globalRes.ok ? await globalRes.json() : { pandaScoreApiKeySet: false, tbaApiKeySet: false };
    const data = { ...userData, ...globalData } as SettingsState;

    // Defensive: the backend migrates an old single-number notifyLeadMinutes
    // to an array, but guard here too in case anything ever slips through —
    // a non-array here would crash every .includes()/.filter() call on it.
    if (!Array.isArray(data.notifyLeadMinutes)) {
      const old = data.notifyLeadMinutes as unknown as number;
      data.notifyLeadMinutes = typeof old === "number" && old > 0 ? [old] : [];
    }
    setSettings(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(
    async (partial: Record<string, unknown>) => {
      // pandaScoreApiKey/tbaApiKey are the only two fields that belong to
      // the global (admin-only) store — route them to /api/global-settings
      // and everything else to the per-user /api/settings, so a caller can
      // keep calling save({ pandaScoreApiKey: ... }) or save({ theme: ... })
      // the same way regardless of which store actually owns the field.
      const { pandaScoreApiKey, tbaApiKey, ...userPartial } = partial as Record<string, unknown> & {
        pandaScoreApiKey?: unknown;
        tbaApiKey?: unknown;
      };
      const globalPartial: Record<string, unknown> = {};
      if (pandaScoreApiKey !== undefined) globalPartial.pandaScoreApiKey = pandaScoreApiKey;
      if (tbaApiKey !== undefined) globalPartial.tbaApiKey = tbaApiKey;

      const requests: Promise<Response>[] = [];
      if (Object.keys(userPartial).length > 0) {
        requests.push(
          fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userPartial),
          })
        );
      }
      if (Object.keys(globalPartial).length > 0) {
        requests.push(
          fetch("/api/global-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(globalPartial),
          })
        );
      }
      await Promise.all(requests);
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
