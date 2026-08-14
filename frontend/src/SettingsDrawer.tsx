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

  // --- Favorite teams (cross-sport) ---
  const [newTeam, setNewTeam] = useState("");
  function addFavoriteTeam() {
    const name = newTeam.trim();
    if (!name || settings.favoriteTeams.includes(name)) return;
    save({ favoriteTeams: [...settings.favoriteTeams, name] });
    setNewTeam("");
  }
  function removeFavoriteTeam(name: string) {
    save({ favoriteTeams: settings.favoriteTeams.filter((t) => t !== name) });
  }

  // --- Notifications ---
  const notificationsSupported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState(notificationsSupported ? Notification.permission : "denied");
  async function requestPermission() {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") save({ notifyOnLive: true });
  }
  function toggleNotify() {
    save({ notifyOnLive: !settings.notifyOnLive });
  }

  // --- Poll interval ---
  const [pollSeconds, setPollSeconds] = useState(String(settings.pollIntervalSeconds));
  function savePollInterval() {
    const n = Number(pollSeconds);
    if (Number.isFinite(n) && n >= 15) save({ pollIntervalSeconds: n });
  }

  // --- Theme ---
  function setTheme(theme: "dark" | "light") {
    save({ theme });
  }

  // --- Calendar feed ---
  const feedUrl = `${window.location.origin}/calendar.ics`;
  const [feedCopied, setFeedCopied] = useState(false);
  function copyFeedUrl() {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setFeedCopied(true);
      setTimeout(() => setFeedCopied(false), 2000);
    });
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

        <section className="settings-section">
          <h3>Favorite teams</h3>
          <span className="hint">Any sport — matched against team names to add the same "★ Your team" badge FRC uses.</span>
          {settings.favoriteTeams.length > 0 && (
            <div className="source-chip-list" style={{ marginTop: 10 }}>
              {settings.favoriteTeams.map((team) => (
                <button key={team} type="button" className="chip active" onClick={() => removeFavoriteTeam(team)}>
                  {team} ×
                </button>
              ))}
            </div>
          )}
          <div className="form-row" style={{ marginTop: 10 }}>
            <input
              className="text-input"
              placeholder="e.g. Lions, Pistons"
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFavoriteTeam()}
            />
            <button className="btn primary" onClick={addFavoriteTeam} disabled={!newTeam.trim()}>
              Add
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Notifications</h3>
          {!notificationsSupported ? (
            <span className="hint">Not supported in this browser.</span>
          ) : permission !== "granted" ? (
            <>
              <span className="hint">Get a browser notification when a favorited or followed event goes live.</span>
              <button className="btn primary" style={{ marginTop: 10 }} onClick={requestPermission}>
                Enable notifications
              </button>
            </>
          ) : (
            <button type="button" className={`chip ${settings.notifyOnLive ? "active" : ""}`} onClick={toggleNotify}>
              {settings.notifyOnLive ? "Notifying on live events" : "Notifications off"}
            </button>
          )}
        </section>

        <section className="settings-section">
          <h3>Refresh interval</h3>
          <span className="hint">How often the dashboard checks for new data, in seconds (minimum 15).</span>
          <div className="form-row" style={{ marginTop: 10 }}>
            <input
              type="number"
              className="text-input"
              min={15}
              value={pollSeconds}
              onChange={(e) => setPollSeconds(e.target.value)}
            />
            <button className="btn primary" onClick={savePollInterval} disabled={Number(pollSeconds) === settings.pollIntervalSeconds}>
              Save
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Theme</h3>
          <div className="source-chip-list">
            <button type="button" className={`chip ${settings.theme === "dark" ? "active" : ""}`} onClick={() => setTheme("dark")}>
              Dark
            </button>
            <button type="button" className={`chip ${settings.theme === "light" ? "active" : ""}`} onClick={() => setTheme("light")}>
              Light
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Calendar feed</h3>
          <span className="hint">
            Subscribe to this URL in Google Calendar, Apple Calendar, or Outlook to get every currently-shown event
            synced automatically.
          </span>
          <div className="form-row" style={{ marginTop: 10 }}>
            <input className="text-input" readOnly value={feedUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
            <button className="btn" onClick={copyFeedUrl}>
              {feedCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        </section>

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
