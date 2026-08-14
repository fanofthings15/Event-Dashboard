import { useState } from "react";
import { useSettings } from "./SettingsContext";
import SourceSettings from "./SourceSettings";
import type { NormalizedEvent } from "./types";

interface Props {
  onClose: () => void;
  allEvents: NormalizedEvent[];
}

export default function SettingsDrawer({ onClose, allEvents }: Props) {
  const { settings, save } = useSettings();

  // PandaScore's key is shared across several esports sources at once, so it
  // stays here rather than in any one source's own settings group.
  const [newPandaKey, setNewPandaKey] = useState("");
  const [pandaKeySaved, setPandaKeySaved] = useState(false);
  async function savePandaKey() {
    await save({ pandaScoreApiKey: newPandaKey });
    setPandaKeySaved(true);
    setNewPandaKey("");
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

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
            <span className="hint">Free key at pandascore.co — shared across every esports title below.</span>
          </label>
          <button className="btn primary" onClick={savePandaKey} disabled={!newPandaKey}>
            Save key
          </button>
          {pandaKeySaved && <span className="ok-tag">Saved</span>}
        </section>

        {/* Everything that only affects one source — on/off, color, league
            filters, and (for FRC) its own API key/team/regions — lives in
            its own collapsible group here. */}
        <section className="settings-section">
          <h3>Data sources</h3>
          <span className="hint">Click a source to configure just that one.</span>
          <div style={{ marginTop: 10 }}>
            <SourceSettings allEvents={allEvents} />
          </div>
        </section>

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
