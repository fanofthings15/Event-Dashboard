import { useEffect, useState } from "react";
import { useSettings } from "./useSettings";
import { CORE_SPORT_META } from "./types";

interface Props {
  onClose: () => void;
}

export default function SettingsDrawer({ onClose }: Props) {
  const { settings, loaded, save } = useSettings();

  // --- API key ---
  const [newKey, setNewKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);

  async function saveKey() {
    await save({ pandaScoreApiKey: newKey });
    setKeySaved(true);
    setNewKey("");
  }

  // --- Data sources (core + esports catalog) ---
  const [disabledCore, setDisabledCore] = useState<string[]>([]);
  const [enabledGames, setEnabledGames] = useState<string[]>([]);
  const [sourcesSaved, setSourcesSaved] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setDisabledCore(settings.disabledCoreSources);
    setEnabledGames(settings.enabledEsportsGames);
  }, [loaded, settings.disabledCoreSources, settings.enabledEsportsGames]);

  function toggleCore(sport: string) {
    setDisabledCore((prev) => (prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]));
    setSourcesSaved(false);
  }
  function toggleGame(slug: string) {
    setEnabledGames((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
    setSourcesSaved(false);
  }
  async function saveSources() {
    await save({ disabledCoreSources: disabledCore, enabledEsportsGames: enabledGames });
    setSourcesSaved(true);
  }

  // --- Excluded leagues ---
  const [leaguesText, setLeaguesText] = useState("");
  const [leaguesSaved, setLeaguesSaved] = useState(false);

  useEffect(() => {
    if (loaded) setLeaguesText(settings.excludedLeagues.join("\n"));
  }, [loaded, settings.excludedLeagues]);

  async function saveLeagues() {
    const list = leaguesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    await save({ excludedLeagues: list });
    setLeaguesSaved(true);
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        {/* API key */}
        <section className="settings-section">
          <h3>PandaScore API key</h3>
          <label className="field">
            <span>{settings.pandaScoreApiKeySet && <span className="ok-tag">set</span>}</span>
            <input
              type="password"
              placeholder={settings.pandaScoreApiKeySet ? "•••••••• (set — enter to replace)" : "Paste your free PandaScore API key"}
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setKeySaved(false);
              }}
            />
            <span className="hint">Free key at pandascore.co — needed for esports data.</span>
          </label>
          <button className="btn primary" onClick={saveKey} disabled={!newKey}>
            Save key
          </button>
          {keySaved && <span className="ok-tag">Saved</span>}
        </section>

        {/* Data sources */}
        <section className="settings-section">
          <h3>Data sources</h3>
          <span className="hint">Off means skipped entirely — no requests made, nothing shown.</span>
          <div className="source-chip-list">
            {Object.entries(CORE_SPORT_META).map(([sport, meta]) => {
              const active = !disabledCore.includes(sport);
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
              const active = enabledGames.includes(g.slug);
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
          <button className="btn primary" onClick={saveSources}>
            Save sources
          </button>
          {sourcesSaved && <span className="ok-tag">Saved</span>}
        </section>

        {/* Excluded leagues */}
        <section className="settings-section">
          <h3>Excluded leagues</h3>
          <span className="hint">One per line — hides any league whose name contains this text (e.g. "LCK Challengers League").</span>
          <textarea
            className="textarea"
            rows={3}
            value={leaguesText}
            onChange={(e) => {
              setLeaguesText(e.target.value);
              setLeaguesSaved(false);
            }}
          />
          <button className="btn primary" onClick={saveLeagues}>
            Save exclusions
          </button>
          {leaguesSaved && <span className="ok-tag">Saved</span>}
        </section>

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
