import { useState } from "react";
import { useSettings } from "./SettingsContext";
import { CORE_SPORT_META } from "./types";
import LeaguePicker from "./LeaguePicker";
import type { NormalizedEvent } from "./types";

interface Props {
  onClose: () => void;
  allEvents: NormalizedEvent[];
}

export default function SettingsDrawer({ onClose, allEvents }: Props) {
  const { settings, save } = useSettings();

  // --- API keys (text fields still need an explicit save — auto-saving on
  // every keystroke would write partial keys) ---
  const [newPandaKey, setNewPandaKey] = useState("");
  const [pandaKeySaved, setPandaKeySaved] = useState(false);
  async function savePandaKey() {
    await save({ pandaScoreApiKey: newPandaKey });
    setPandaKeySaved(true);
    setNewPandaKey("");
  }

  const [newTbaKey, setNewTbaKey] = useState("");
  const [tbaKeySaved, setTbaKeySaved] = useState(false);
  async function saveTbaKey() {
    await save({ tbaApiKey: newTbaKey });
    setTbaKeySaved(true);
    setNewTbaKey("");
  }

  const [teamKey, setTeamKey] = useState(settings.frcTeamKey);
  const [teamKeySaved, setTeamKeySaved] = useState(false);
  async function saveTeamKey() {
    await save({ frcTeamKey: teamKey });
    setTeamKeySaved(true);
  }

  // --- Data sources — every click saves immediately, no Save button ---
  function toggleCore(sport: string) {
    const next = settings.disabledCoreSources.includes(sport)
      ? settings.disabledCoreSources.filter((s) => s !== sport)
      : [...settings.disabledCoreSources, sport];
    save({ disabledCoreSources: next });
  }
  function toggleGame(slug: string) {
    const next = settings.enabledEsportsGames.includes(slug)
      ? settings.enabledEsportsGames.filter((s) => s !== slug)
      : [...settings.enabledEsportsGames, slug];
    save({ enabledEsportsGames: next });
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        {/* API keys */}
        <section className="settings-section">
          <h3>PandaScore API key</h3>
          <label className="field">
            <span>{settings.pandaScoreApiKeySet && <span className="ok-tag">set</span>}</span>
            <input
              type="password"
              placeholder={settings.pandaScoreApiKeySet ? "•••••••• (set — enter to replace)" : "Paste your free PandaScore API key"}
              value={newPandaKey}
              onChange={(e) => {
                setNewPandaKey(e.target.value);
                setPandaKeySaved(false);
              }}
            />
            <span className="hint">Free key at pandascore.co — needed for esports data.</span>
          </label>
          <button className="btn primary" onClick={savePandaKey} disabled={!newPandaKey}>
            Save key
          </button>
          {pandaKeySaved && <span className="ok-tag">Saved</span>}
        </section>

        <section className="settings-section">
          <h3>FRC — The Blue Alliance</h3>
          <label className="field">
            <span>{settings.tbaApiKeySet && <span className="ok-tag">set</span>}</span>
            <input
              type="password"
              placeholder={settings.tbaApiKeySet ? "•••••••• (set — enter to replace)" : "Paste your free TBA Read API key"}
              value={newTbaKey}
              onChange={(e) => {
                setNewTbaKey(e.target.value);
                setTbaKeySaved(false);
              }}
            />
            <span className="hint">
              Free key at thebluealliance.com/account — only full events are shown, not individual matches.
            </span>
          </label>
          <button className="btn primary" onClick={saveTbaKey} disabled={!newTbaKey}>
            Save key
          </button>
          {tbaKeySaved && <span className="ok-tag">Saved</span>}

          <label className="field" style={{ marginTop: 12 }}>
            <span>Team to follow</span>
            <input
              className="text-input"
              placeholder="e.g. frc254"
              value={teamKey}
              onChange={(e) => {
                setTeamKey(e.target.value);
                setTeamKeySaved(false);
              }}
            />
          </label>
          <button className="btn primary" onClick={saveTeamKey} disabled={!teamKey}>
            Save team
          </button>
          {teamKeySaved && <span className="ok-tag">Saved</span>}
        </section>

        {/* Data sources */}
        <section className="settings-section">
          <h3>Data sources</h3>
          <span className="hint">Off means skipped entirely — no requests made, nothing shown.</span>
          <div className="source-chip-list">
            {Object.entries(CORE_SPORT_META).map(([sport, meta]) => {
              const active = !settings.disabledCoreSources.includes(sport);
              return (
                <button
                  key={sport}
                  type="button"
                  className={`chip ${active ? "active" : ""}`}
                  style={active ? { borderColor: meta.color, background: `${meta.color}26`, color: "#fff" } : undefined}
                  onClick={() => toggleCore(sport)}
                >
                  <span className="dot" style={{ background: meta.color }} />
                  {meta.label}
                </button>
              );
            })}
            {settings.esportsCatalog.map((g) => {
              const active = settings.enabledEsportsGames.includes(g.slug);
              return (
                <button
                  key={g.slug}
                  type="button"
                  className={`chip ${active ? "active" : ""}`}
                  style={active ? { borderColor: g.color, background: `${g.color}26`, color: "#fff" } : undefined}
                  onClick={() => toggleGame(g.slug)}
                >
                  <span className="dot" style={{ background: g.color }} />
                  {g.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* League filtering */}
        <section className="settings-section">
          <h3>Leagues</h3>
          <span className="hint">Highlighted leagues are shown; click to hide one. Only leagues currently in your data appear here.</span>
          <div style={{ marginTop: 10 }}>
            <LeaguePicker allEvents={allEvents} />
          </div>
        </section>

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
