import { useState } from "react";
import type { NormalizedEvent } from "./types";
import type { EsportsGame } from "./settingsTypes";
import { sportMeta } from "./sportMeta";
import { isLiveNow } from "./eventStatus";
import { liquipediaLeagueUrl, liquipediaSearchUrl } from "./types";
import { googleCalendarUrl } from "./googleCalendar";
import { useSettings } from "./SettingsContext";
import ConfirmDialog from "./ConfirmDialog";
import FollowStar from "./FollowStar";
import { formatCountdown } from "./countdown";
import { formatEventDate, formatEventTime } from "./dateFormat";

interface Props {
  event: NormalizedEvent;
  now: Date;
  catalog: EsportsGame[];
  onClose: () => void;
  onTeamClick: (teamName: string) => void;
}

function formatRange(startIso: string, endIso: string | undefined, timezone: string) {
  const startStr = formatEventTime(startIso, timezone);
  if (!endIso) return startStr;
  const endStr = formatEventDate(endIso, timezone);
  return `${formatEventDate(startIso, timezone)} – ${endStr}`;
}

export default function EventDetailModal({ event, now, catalog, onClose, onTeamClick }: Props) {
  const { settings, save } = useSettings();
  const [confirmingHide, setConfirmingHide] = useState(false);
  const [streamMenuOpen, setStreamMenuOpen] = useState(false);

  const meta = sportMeta(event, catalog, settings.sportColorOverrides);
  const live = isLiveNow(event, now);
  const alreadyHidden = settings.excludedLeagues.includes(event.league);
  // A direct league page (e.g. the LCK page) is far more useful than a
  // search results page — fall back to search only if the league itself
  // doesn't have a clean wiki page, then to the source's own link.
  const fallbackUrl = event.detailUrl ?? liquipediaLeagueUrl(event.sport, event.league) ?? liquipediaSearchUrl(event.sport, event.name);

  const eventKey = `${event.sport}-${event.id}`;
  // Combines the server's own computed flag (e.g. always-true for custom
  // events) with the locally-toggled state, so the badge updates instantly
  // on click rather than waiting for the next poll to confirm it.
  const isManuallyFollowed = event.manuallyFollowed || settings.followedEventIds.includes(eventKey);
  const isSnoozed = settings.snoozedEventIds.includes(eventKey);

  async function toggleSnooze() {
    const next = isSnoozed ? settings.snoozedEventIds.filter((k) => k !== eventKey) : [...settings.snoozedEventIds, eventKey];
    await save({ snoozedEventIds: next });
  }

  async function confirmHideLeague() {
    await save({ excludedLeagues: [...settings.excludedLeagues, event.league] });
    setConfirmingHide(false);
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="modal" style={{ borderLeftColor: meta.color, borderLeftWidth: 4 }} onClick={(e) => e.stopPropagation()}>
        <div className="event-top" style={{ marginBottom: 8 }}>
          <span className="sport-tag">{meta.label}</span>
          <div className="event-top-right">
            <FollowStar event={event} />
            {live ? <span className="live-badge">LIVE</span> : <span className="countdown">{formatCountdown(event.startTime, now)}</span>}
          </div>
        </div>

        <h2 style={{ marginTop: 0, marginBottom: 8 }}>{event.name}</h2>
        {event.followed && <span className="followed-chip">★ Your team</span>}
        <div className="hint" style={{ marginBottom: 14 }}>
          {event.league} · {formatRange(event.startTime, event.endTime, settings.timezone)}
          {event.venue ? ` · ${event.venue}` : ""}
          {live && event.liveDetail ? ` · ${event.liveDetail}` : ""}
        </div>

        {event.seriesScore && (
          <div className="detail-score" style={{ marginBottom: 14 }}>
            {event.seriesScore}
          </div>
        )}

        {event.teams && event.teams.length > 0 && (
          <div className="detail-teams">
            {event.teams.map((t) => (
              <button type="button" key={t.name} className="detail-team detail-team-clickable" onClick={() => onTeamClick(t.name)}>
                {t.imageUrl && <img src={t.imageUrl} alt="" className="detail-team-logo" />}
                <span>{t.name}</span>
                {t.record && <span className="hint">{t.record}</span>}
              </button>
            ))}
          </div>
        )}

        {event.extra && event.extra.length > 0 && (
          <div className="detail-facts">
            {event.extra.map((f) => (
              <div key={f.label} className="detail-fact">
                <span className="hint">{f.label}:</span>
                <span>{f.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="detail-actions">
          <button type="button" className={`btn ${isSnoozed ? "primary" : ""}`} onClick={toggleSnooze}>
            {isSnoozed ? "🔕 Snoozed — no notifications" : "🔔 Snooze notifications"}
          </button>
          {event.streams && event.streams.length > 1 ? (
            <div className="stream-picker">
              <button type="button" className="btn primary" onClick={() => setStreamMenuOpen((o) => !o)}>
                Watch live ▾
              </button>
              {streamMenuOpen && (
                <div className="stream-menu">
                  {event.streams.map((s, i) => (
                    <a
                      key={s.label}
                      className={`stream-menu-item${i === 0 ? " preferred" : ""}`}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setStreamMenuOpen(false)}
                    >
                      {s.label}
                      {i === 0 && <span className="hint"> (preferred)</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            event.streamUrl && (
              <a className="btn primary" href={event.streamUrl} target="_blank" rel="noopener noreferrer">
                Watch live
              </a>
            )
          )}
          {fallbackUrl && (
            <a className="btn" href={fallbackUrl} target="_blank" rel="noopener noreferrer">
              More info ↗
            </a>
          )}
          <a className="btn" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            Add to Google Calendar
          </a>
        </div>
        {isManuallyFollowed && (
          <span className="hint" style={{ display: "block", marginBottom: 12 }}>
            You'll get a browser notification when this goes live. It's also guaranteed to stay in your{" "}
            <code>/calendar.ics</code> feed if you ever turn on "favorites only" in Settings.
          </span>
        )}

        {event.sport !== "custom" && !alreadyHidden && (
          <button className="btn-x-link" onClick={() => setConfirmingHide(true)}>
            Hide "{event.league}" from my feed
          </button>
        )}

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Close
        </button>
      </div>

      {confirmingHide && (
        <ConfirmDialog
          title="Hide this league?"
          message={`All future events from "${event.league}" will be hidden until you unhide it in Settings.`}
          confirmLabel="Hide"
          onConfirm={confirmHideLeague}
          onCancel={() => setConfirmingHide(false)}
        />
      )}
    </div>
  );
}
