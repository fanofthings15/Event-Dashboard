import { useState } from "react";
import type { NormalizedEvent } from "./types";
import type { EsportsGame } from "./settingsTypes";
import { sportMeta } from "./sportMeta";
import { isLiveNow } from "./eventStatus";
import { liquipediaSearchUrl } from "./types";
import { googleCalendarUrl } from "./googleCalendar";
import { useSettings } from "./SettingsContext";
import ConfirmDialog from "./ConfirmDialog";
import { formatCountdown } from "./countdown";

interface Props {
  event: NormalizedEvent;
  now: Date;
  catalog: EsportsGame[];
  onClose: () => void;
}

function formatRange(startIso: string, endIso: string | undefined) {
  const start = new Date(startIso);
  const startStr = start.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (!endIso) return startStr;
  const end = new Date(endIso);
  const endStr = end.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} – ${endStr}`;
}

export default function EventDetailModal({ event, now, catalog, onClose }: Props) {
  const { settings, save } = useSettings();
  const [confirmingHide, setConfirmingHide] = useState(false);

  const meta = sportMeta(event, catalog);
  const live = isLiveNow(event, now);
  const alreadyHidden = settings.excludedLeagues.includes(event.league);
  const fallbackUrl = event.detailUrl ?? liquipediaSearchUrl(event.sport, event.teams?.map((t) => t.name).join(" ") || event.name);

  async function confirmHideLeague() {
    await save({ excludedLeagues: [...settings.excludedLeagues, event.league] });
    setConfirmingHide(false);
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="event-top" style={{ marginBottom: 8 }}>
          <span className="sport-tag">{meta.label}</span>
          {live ? <span className="live-badge">LIVE</span> : <span className="countdown">{formatCountdown(event.startTime, now)}</span>}
        </div>

        <h2 style={{ marginTop: 0, marginBottom: 8 }}>{event.name}</h2>
        {event.followed && <span className="followed-chip">★ Your team</span>}
        <div className="hint" style={{ marginBottom: 14 }}>
          {event.league} · {formatRange(event.startTime, event.endTime)}
          {event.venue ? ` · ${event.venue}` : ""}
        </div>

        {event.seriesScore && (
          <div className="detail-score" style={{ marginBottom: 14 }}>
            {event.seriesScore}
          </div>
        )}

        {event.teams && event.teams.length > 0 && (
          <div className="detail-teams">
            {event.teams.map((t) => (
              <div key={t.name} className="detail-team">
                {t.imageUrl && <img src={t.imageUrl} alt="" className="detail-team-logo" />}
                <span>{t.name}</span>
                {t.record && <span className="hint">{t.record}</span>}
              </div>
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
          {event.streamUrl && (
            <a className="btn primary" href={event.streamUrl} target="_blank" rel="noopener noreferrer">
              Watch live
            </a>
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
