import { useState } from "react";
import { useSettings } from "./SettingsContext";
import SourceSettings from "./SourceSettings";
import { COMMON_TIMEZONES } from "./dateFormat";
import type { NormalizedEvent } from "./types";

interface Props {
  onClose: () => void;
  allEvents: NormalizedEvent[];
}

export default function SettingsDrawer({ onClose, allEvents }: Props) {
  const { settings, save, refetch } = useSettings();

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
  // A plain number or "frcNNN" entry is treated as an FRC team key too —
  // FRC events don't carry a team roster the way other sources do, so
  // name-matching can't work there; this keeps it to one list anyway by
  // auto-driving the exact-match mechanism FRC actually needs under the hood.
  function isFrcTeamEntry(name: string): boolean {
    return /^\d+$/.test(name) || /^frc\d+$/i.test(name);
  }
  const [newTeam, setNewTeam] = useState("");
  function addFavoriteTeam() {
    const name = newTeam.trim();
    if (!name || settings.favoriteTeams.includes(name)) return;
    const next: Record<string, unknown> = { favoriteTeams: [...settings.favoriteTeams, name] };
    if (isFrcTeamEntry(name)) {
      next.frcTeamKey = name;
      next.frcFollowEnabled = true;
    }
    save(next);
    setNewTeam("");
  }
  function removeFavoriteTeam(name: string) {
    const next: Record<string, unknown> = { favoriteTeams: settings.favoriteTeams.filter((t) => t !== name) };
    if (isFrcTeamEntry(name) && name === settings.frcTeamKey) {
      next.frcTeamKey = "";
      next.frcFollowEnabled = false;
    }
    save(next);
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
  function setNotifyMode(mode: "followed" | "all") {
    save({ notifyMode: mode });
  }
  function toggleNotifyLead(minutes: number) {
    const next = settings.notifyLeadMinutes.includes(minutes)
      ? settings.notifyLeadMinutes.filter((m) => m !== minutes)
      : [...settings.notifyLeadMinutes, minutes];
    save({ notifyLeadMinutes: next });
  }
  function toggleNotifySound() {
    save({ notifySoundEnabled: !settings.notifySoundEnabled });
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
  // Token-scoped per user (settings.icsToken) rather than a bare
  // /calendar.ics — that endpoint is fetched by external calendar apps,
  // which can't share this browser's Authentik session, so the token in
  // the URL is what ties the feed to this person's own events/settings.
  const feedUrl = settings.icsToken ? `${window.location.origin}/calendar.ics?token=${settings.icsToken}` : "";
  const [feedCopied, setFeedCopied] = useState(false);
  const [regeneratingFeed, setRegeneratingFeed] = useState(false);
  function copyFeedUrl() {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setFeedCopied(true);
      setTimeout(() => setFeedCopied(false), 2000);
    });
  }
  async function regenerateFeedUrl() {
    setRegeneratingFeed(true);
    try {
      await fetch("/api/settings/regenerate-ics-token", { method: "POST" });
      await refetch();
    } finally {
      setRegeneratingFeed(false);
    }
  }
  function setIcsMode(favoritesOnly: boolean) {
    save({ icsFavoritesOnly: favoritesOnly });
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
          <span className="hint">
            Any sport — matched against team names for the "★ Your team" badge. For FRC, add a
            team number instead (e.g. "254") — that's what actually follows a specific team there,
            since FRC events don't carry team names to match against.
          </span>
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
            <>
              <button type="button" className={`chip ${settings.notifyOnLive ? "active" : ""}`} onClick={toggleNotify}>
                {settings.notifyOnLive ? "Notifying on live events" : "Notifications off"}
              </button>
              {settings.notifyOnLive && (
                <div className="source-chip-list" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className={`chip ${settings.notifyMode === "all" ? "active" : ""}`}
                    onClick={() => setNotifyMode("all")}
                  >
                    Every live event
                  </button>
                  <button
                    type="button"
                    className={`chip ${settings.notifyMode === "followed" ? "active" : ""}`}
                    onClick={() => setNotifyMode("followed")}
                  >
                    Followed teams only
                  </button>
                </div>
              )}
              {settings.notifyOnLive && (
                <button type="button" className={`chip ${settings.notifySoundEnabled ? "active" : ""}`} style={{ marginTop: 10 }} onClick={toggleNotifySound}>
                  {settings.notifySoundEnabled ? "🔊 Sound on" : "🔇 Sound muted"}
                </button>
              )}
              {settings.notifyOnLive && (
                <>
                  <span className="hint" style={{ display: "block", marginTop: 12, marginBottom: 6 }}>
                    Also get a heads-up before an event starts — pick any combination:
                  </span>
                  <div className="source-chip-list">
                    {[0, 5, 15, 30, 60].map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        className={`chip ${settings.notifyLeadMinutes.includes(minutes) ? "active" : ""}`}
                        onClick={() => toggleNotifyLead(minutes)}
                      >
                        {minutes === 0 ? "At start" : `${minutes} min before`}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
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
          <h3>Layout</h3>
          <div className="source-chip-list">
            <button type="button" className={`chip ${!settings.compactCards ? "active" : ""}`} onClick={() => save({ compactCards: false })}>
              Comfortable
            </button>
            <button type="button" className={`chip ${settings.compactCards ? "active" : ""}`} onClick={() => save({ compactCards: true })}>
              Compact
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Timezone</h3>
          <span className="hint">Show event times in a specific timezone instead of your browser's local one.</span>
          <select
            className="text-input"
            style={{ marginTop: 10 }}
            value={settings.timezone}
            onChange={(e) => save({ timezone: e.target.value })}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </section>

        <section className="settings-section">
          <h3>Calendar feed</h3>
          <span className="hint">
            Subscribe to this URL in Google Calendar, Apple Calendar, or Outlook to get every currently-shown event
            synced automatically — no need to add events one at a time.
          </span>
          <div className="form-row" style={{ marginTop: 10 }}>
            <input className="text-input" readOnly value={feedUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
            <button className="btn" onClick={copyFeedUrl} disabled={!feedUrl}>
              {feedCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="form-row" style={{ marginTop: 6 }}>
            <button className="btn" onClick={regenerateFeedUrl} disabled={regeneratingFeed}>
              {regeneratingFeed ? "Regenerating…" : "Regenerate link"}
            </button>
          </div>
          <span className="hint" style={{ display: "block", marginTop: 6 }}>
            This link is yours alone — anyone who has it can see your feed, so regenerate it if it's ever shared
            somewhere it shouldn't be. Regenerating breaks the old link.
          </span>
          <div className="source-chip-list" style={{ marginTop: 10 }}>
            <button type="button" className={`chip ${!settings.icsFavoritesOnly ? "active" : ""}`} onClick={() => setIcsMode(false)}>
              Everything enabled
            </button>
            <button type="button" className={`chip ${settings.icsFavoritesOnly ? "active" : ""}`} onClick={() => setIcsMode(true)}>
              Favorites only
            </button>
          </div>
          <span className="hint" style={{ display: "block", marginTop: 6 }}>
            Want just specific teams instead of whole sports/leagues? Add them under Favorite teams above, then
            flip this on — the feed narrows to just those (plus your custom events).
          </span>
        </section>

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
