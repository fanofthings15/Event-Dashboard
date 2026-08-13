export interface EsportsGame {
  slug: string;
  sport: string;
  label: string;
  color: string;
}

export interface CustomEvent {
  id: string;
  name: string;
  league: string;
  color: string;
  startTime: string;
  durationMinutes: number;
  url?: string;
}

export interface SettingsState {
  pandaScoreApiKeySet: boolean;
  tbaApiKeySet: boolean;
  frcTeamKey: string;
  frcFollowEnabled: boolean;
  frcRegions: string[];
  excludedLeagues: string[];
  disabledCoreSources: string[];
  enabledEsportsGames: string[];
  customEvents: CustomEvent[];
  esportsCatalog: EsportsGame[];
}
