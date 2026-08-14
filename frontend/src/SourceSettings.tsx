import { useMemo, useRef, useState } from "react";
import { useSettings } from "./SettingsContext";
import { CORE_SPORT_META, type NormalizedEvent } from "./types";
import { sportMeta } from "./sportMeta";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  allEvents: NormalizedEvent[];
}

export default function SourceSettings({ allEvents }: Props) {
  const { settings, save } = useSettings();
  const [pendingImport, setPendingImport] = useState<Record<string, unknown> | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- FRC-only fields (TBA key is its own text field since auto-saving on
  // every keystroke would write a partial key) ---
  const [newTbaKey, setNewTbaKey] = useState("");
  const [tbaKeySaved, setTbaKeySaved] = useState(false);
  async function saveTbaKey() {
    await save({ tbaApiKey: newTbaKey });
    setTbaKeySaved(true);
    setNewTbaKey("");
  }

  function toggleRegion(region: string) {
    const current = settings.frcRegions;
    const next = current.includes(region) ? current.filter((r) => r !== region) : [...current, region];
    save({ frcRegions: next });
  }
  function showAllRegions() {
    save({ frcRegions: [] });
  }

  const frcRegionsAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEvents) {
      if (e.sport === "frc" && e.region) set.add(e.region);
    }
    return [...set].sort();
  }, [allEvents]);

  // --- Enable/disable, per source ---
  function isEnabled(sport: string, esportsSlug: string | null): boolean {
    if (esportsSlug) return settings.enabledEsportsGames.includes(esportsSlug);
    return !settings.disabledCoreSources.includes(sport);
  }
  function toggleEnabled(sport: string, esportsSlug: string | null) {
    if (esportsSlug) {
      const next = settings.enabledEsportsGames.includes(esportsSlug)
        ? settings.enabledEsportsGames.filter((s) => s !== esportsSlug)
        : [...settings.enabledEsportsGames, esportsSlug];
      save({ enabledEsportsGames: next });
    } else {
      const next = settings.disabledCoreSources.includes(sport)
        ? settings.disabledCoreSources.filter((s) => s !== sport)
        : [...settings.disabledCoreSources, sport];
      save({ disabledCoreSources: next });
    }
  }

  // --- Color overrides, per source ---
  function setColor(sport: string, color: string) {
    save({ sportColorOverrides: { ...settings.sportColorOverrides, [sport]: color } });
  }
  function resetColor(sport: string) {
    const next = { ...settings.sportColorOverrides };
    delete next[sport];
    save({ sportColorOverrides: next });
  }

  function toggleExpanded(sport: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  }

  function toggleLeague(league: string) {
    const next = settings.excludedLeagues.includes(league)
      ? settings.excludedLeagues.filter((l) => l !== league)
      : [...settings.excludedLeagues, league];
    save({ excludedLeagues: next });
  }

  // Every known source gets a group, whether or not it currently has any
  // events — so a disabled or off-season source stays configurable instead
  // of disappearing. League names within each group still come from
  // currently-live data only, so a one-off tournament doesn't clutter this
  // forever once it's gone.
  const sourcesBySport = useMemo(() => {
    const map = new Map<string, { esportsSlug: string | null; leagues: Set<string> }>();
    for (const sport of Object.keys(CORE_SPORT_META)) map.set(sport, { esportsSlug: null, leagues: new Set() });
    for (const g of settings.esportsCatalog) map.set(g.sport, { esportsSlug: g.slug, leagues: new Set() });
    for (const e of allEvents) {
      if (e.sport === "custom") continue;
      if (!map.has(e.sport)) map.set(e.sport, { esportsSlug: null, leagues: new Set() });
      map.get(e.sport)!.leagues.add(e.league);
    }
    return map;
  }, [allEvents, settings.esportsCatalog]);

  function exportSettings() {
    // Deliberately excludes API keys — this file is meant to move between
    // machines, and plaintext secrets shouldn't ride along in a download.
    const payload = {
      excludedLeagues: settings.excludedLeagues,
      disabledCoreSources: settings.disabledCoreSources,
      enabledEsportsGames: settings.enabledEsportsGames,
      customEvents: settings.customEvents,
      frcTeamKey: settings.frcTeamKey,
      frcFollowEnabled: settings.frcFollowEnabled,
      frcRegions: settings.frcRegions,
      sportColorOverrides: settings.sportColorOverrides,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "event-dashboard-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setPendingImport(parsed);
      } catch {
        // Silently ignored — malformed file, nothing to import.
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function confirmImport() {
    if (pendingImport) await save(pendingImport);
    setPendingImport(null);
  }

  return (
    <div>
      {/* Quick toggle row — click through on/off for every source at a
          glance, without needing to open each one's group. */}
      <div className="source-chip-list" style={{ marginBottom: 8 }}>
        {[...sourcesBySport.entries()].map(([sport, { esportsSlug }]) => {
          const meta = sportMeta({ sport } as NormalizedEvent, settings.esportsCatalog, settings.sportColorOverrides);
          const enabled = isEnabled(sport, esportsSlug);
          return (
            <button
              key={sport}
              type="button"
              className={`chip ${enabled ? "active" : ""}`}
              style={enabled ? { borderColor: meta.color, background: `${meta.color}26`, color: "#fff" } : undefined}
              onClick={() => toggleEnabled(sport, esportsSlug)}
            >
              <span className="dot" style={{ background: meta.color }} />
              {meta.label}
            </button>
          );
        })}
      </div>
      <span className="hint" style={{ display: "block", marginBottom: 14 }}>
        Only enabled sources show detailed settings below — turn one on above to configure it.
      </span>

      {[...sourcesBySport.entries()]
        .filter(([sport, { esportsSlug }]) => isEnabled(sport, esportsSlug))
        .map(([sport, { leagues }]) => {
        const meta = sportMeta({ sport } as NormalizedEvent, settings.esportsCatalog, settings.sportColorOverrides);
        const isOpen = expanded.has(sport);
        const isFrc = sport === "frc";
        const currentColor = settings.sportColorOverrides[sport] || meta.color;
        const isCustomColor = Boolean(settings.sportColorOverrides[sport]);

        return (
          <div key={sport} className="source-group">
            <div className="source-group-header">
              <button type="button" className="league-group-title" onClick={() => toggleExpanded(sport)}>
                <span className={`league-chevron ${isOpen ? "open" : ""}`}>›</span>
                {meta.label}
              </button>
              <input
                type="color"
                className="source-color-bubble"
                value={currentColor}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setColor(sport, e.target.value)}
                title="Pick a color for this source"
              />
            </div>

            {isOpen && (
              <div style={{ marginTop: 4, marginBottom: 4 }}>
                {isCustomColor && (
                  <button type="button" className="btn-x-link" onClick={() => resetColor(sport)}>
                    Reset color to default
                  </button>
                )}

                {isFrc && (
                  <div style={{ marginTop: 10 }}>
                    <label className="field">
                      <span>
                        Blue Alliance API key {settings.tbaApiKeySet && <span className="ok-tag">set</span>}
                      </span>
                      <input
                        type="password"
                        placeholder={settings.tbaApiKeySet ? "•••••••• (set — enter to replace)" : "Paste your free TBA Read API key"}
                        value={newTbaKey}
                        onChange={(e) => {
                          setNewTbaKey(e.target.value);
                          setTbaKeySaved(false);
                        }}
                      />
                      <span className="hint">Free key at thebluealliance.com/account.</span>
                    </label>
                    <button className="btn primary" onClick={saveTbaKey} disabled={!newTbaKey}>
                      Save key
                    </button>
                    {tbaKeySaved && <span className="ok-tag">Saved</span>}

                    <span className="hint" style={{ display: "block", marginTop: 12, marginBottom: 10 }}>
                      To follow a specific team, add its number under{" "}
                      <strong>Favorite teams</strong> (e.g. "254") — FRC needs an exact team
                      number rather than a name, so a numeric entry there is automatically used
                      here too.
                      {settings.frcTeamKey && (
                        <>
                          {" "}
                          Currently following team <strong>{settings.frcTeamKey}</strong>.
                        </>
                      )}
                    </span>

                    <div className="field" style={{ marginBottom: 6 }}>
                      <span>
                        Regions{" "}
                        {settings.frcRegions.length > 0 && (
                          <span className="hint">
                            (showing {settings.frcRegions.length} of {frcRegionsAvailable.length})
                          </span>
                        )}
                      </span>
                    </div>
                    {frcRegionsAvailable.length === 0 ? (
                      <span className="hint">No regions seen yet — check back once FRC events have synced.</span>
                    ) : (
                      <div className="source-chip-list">
                        <button type="button" className={`chip ${settings.frcRegions.length === 0 ? "active" : ""}`} onClick={showAllRegions}>
                          All regions
                        </button>
                        {frcRegionsAvailable.map((region) => {
                          const active = settings.frcRegions.length === 0 || settings.frcRegions.includes(region);
                          return (
                            <button
                              key={region}
                              type="button"
                              className={`chip ${active ? "active" : ""}`}
                              style={active ? { borderColor: meta.color, background: `${meta.color}26`, color: "#fff" } : undefined}
                              onClick={() => toggleRegion(region)}
                            >
                              {region}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {!isFrc && (
                  <div className="source-chip-list" style={{ marginTop: 8 }}>
                    {leagues.size === 0 ? (
                      <span className="hint">No leagues seen yet.</span>
                    ) : (
                      [...leagues].sort().map((league) => {
                        const hidden = settings.excludedLeagues.includes(league);
                        return (
                          <button
                            key={league}
                            type="button"
                            className={`chip ${!hidden ? "active" : ""}`}
                            style={!hidden ? { borderColor: meta.color, background: `${meta.color}26`, color: "#fff" } : undefined}
                            onClick={() => toggleLeague(league)}
                          >
                            {league}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="form-row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={exportSettings}>
          Export settings
        </button>
        <button className="btn" onClick={() => fileInputRef.current?.click()}>
          Import settings
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={onFileChosen} />
      </div>

      {pendingImport && (
        <ConfirmDialog
          title="Import settings?"
          message="This will overwrite your current data sources, colors, league filters, and custom events with what's in the file."
          confirmLabel="Import"
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
