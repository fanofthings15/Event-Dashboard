import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "./SettingsContext";
import type { NormalizedEvent } from "./types";
import { sportMeta } from "./sportMeta";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  allEvents: NormalizedEvent[];
}

export default function LeaguePicker({ allEvents }: Props) {
  const { settings, save } = useSettings();
  const [pendingImport, setPendingImport] = useState<Record<string, unknown> | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [teamKey, setTeamKey] = useState(settings.frcTeamKey);
  const [teamKeySaved, setTeamKeySaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveTeamKey() {
    await save({ frcTeamKey: teamKey });
    setTeamKeySaved(true);
  }

  useEffect(() => {
    setTeamKey(settings.frcTeamKey);
  }, [settings.frcTeamKey]);

  function toggleExpanded(sport: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  }

  function toggleFollowEnabled() {
    save({ frcFollowEnabled: !settings.frcFollowEnabled });
  }

  // Include-list toggle: first click narrows to just that region; clicking
  // an already-included region removes it; an explicit "All regions" resets
  // back to showing everything. Uses the unfiltered event set so a region
  // you've narrowed away from doesn't disappear from the picker itself.
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

  // Group distinct league names by sport, from currently-live data only —
  // so a one-off tournament's league doesn't clutter this list forever once
  // it's no longer showing up in any feed. FRC always gets a group even
  // with zero current events, since its season is mostly off-season and the
  // team-follow field needs to stay reachable regardless.
  const leaguesBySport = useMemo(() => {
    const map = new Map<string, Set<string>>();
    map.set("frc", new Set());
    for (const e of allEvents) {
      if (e.sport === "custom") continue;
      if (!map.has(e.sport)) map.set(e.sport, new Set());
      map.get(e.sport)!.add(e.league);
    }
    return map;
  }, [allEvents]);

  function toggleLeague(league: string) {
    const next = settings.excludedLeagues.includes(league)
      ? settings.excludedLeagues.filter((l) => l !== league)
      : [...settings.excludedLeagues, league];
    save({ excludedLeagues: next });
  }

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
      {[...leaguesBySport.entries()].map(([sport, leagues]) => {
        const meta = sportMeta({ sport } as NormalizedEvent, settings.esportsCatalog);
        const isOpen = expanded.has(sport);
        const hiddenCount = [...leagues].filter((l) => settings.excludedLeagues.includes(l)).length;
        return (
          <div key={sport} className="league-group">
            <button type="button" className="league-group-title" onClick={() => toggleExpanded(sport)}>
              <span className={`league-chevron ${isOpen ? "open" : ""}`}>›</span>
              <span className="dot" style={{ background: meta.color }} />
              {meta.label}
              {sport !== "frc" && (
                <span className="hint">
                  ({leagues.size}{hiddenCount > 0 ? `, ${hiddenCount} hidden` : ""})
                </span>
              )}
            </button>
            {isOpen && sport === "frc" && (
              <div style={{ marginTop: 8 }}>
                <label className="field">
                  <span>Team to follow</span>
                  <input
                    className="text-input"
                    placeholder="e.g. 254 or frc254 — leave blank for none"
                    value={teamKey}
                    onChange={(e) => {
                      setTeamKey(e.target.value);
                      setTeamKeySaved(false);
                    }}
                  />
                </label>
                <div className="form-row" style={{ marginBottom: 10 }}>
                  <button className="btn primary" onClick={saveTeamKey} disabled={teamKey === settings.frcTeamKey}>
                    Save team
                  </button>
                  {teamKeySaved && <span className="ok-tag">Saved</span>}
                </div>
                <button
                  type="button"
                  className={`chip ${settings.frcFollowEnabled ? "active" : ""}`}
                  style={settings.frcFollowEnabled ? { borderColor: meta.color, background: `${meta.color}26`, color: "#fff" } : undefined}
                  onClick={toggleFollowEnabled}
                  disabled={!settings.frcTeamKey}
                >
                  {settings.frcFollowEnabled ? "Tagging followed team's events" : "Tag followed team's events"}
                </button>
                <span className="hint" style={{ display: "block", marginTop: 6, marginBottom: 10 }}>
                  When on, events your team is competing in get a small badge — this never hides other FRC events.
                </span>

                <div className="field" style={{ marginBottom: 6 }}>
                  <span>
                    Regions {settings.frcRegions.length > 0 && <span className="hint">(showing {settings.frcRegions.length} of {frcRegionsAvailable.length})</span>}
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
            {isOpen && sport !== "frc" && (
              <div className="source-chip-list" style={{ marginTop: 8 }}>
                {[...leagues].sort().map((league) => {
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
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="form-row" style={{ marginTop: 12 }}>
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
          message="This will overwrite your current data sources, league filters, and custom events with what's in the file."
          confirmLabel="Import"
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
