import { useEffect, useState } from "react";

interface Props {
  onClose: () => void;
}

export default function SettingsDrawer({ onClose }: Props) {
  const [keySet, setKeySet] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setKeySet(Boolean(d.pandaScoreApiKeySet)));
  }, []);

  async function save() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pandaScoreApiKey: newKey }),
    });
    setSaved(true);
    setKeySet(true);
    setNewKey("");
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label className="field">
          <span>PandaScore API key {keySet && <span className="ok-tag">set</span>}</span>
          <input
            type="password"
            placeholder={keySet ? "•••••••• (set — enter to replace)" : "Paste your free PandaScore API key"}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <span className="hint">Free key at pandascore.co — needed for CS2 / LoL / Rocket League match data.</span>
        </label>

        <button className="btn primary" onClick={save} disabled={!newKey}>
          Save
        </button>
        {saved && <span className="ok-tag">Saved</span>}

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
