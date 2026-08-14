import type { NormalizedEvent } from "./types";
import type { EsportsGame } from "./settingsTypes";
import { sportMeta } from "./sportMeta";
import { isLiveNow } from "./eventStatus";

interface Props {
  date: Date;
  events: NormalizedEvent[];
  catalog: EsportsGame[];
  overrides: Record<string, string>;
  now: Date;
  onClose: () => void;
  onEventClick: (e: NormalizedEvent) => void;
}

export default function DayDetailModal({ date, events, catalog, overrides, now, onClose, onEventClick }: Props) {
  const sorted = [...events].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const byHour = new Map<number, NormalizedEvent[]>();
  for (const e of sorted) {
    const hour = new Date(e.startTime).getHours();
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour)!.push(e);
  }
  const hours = [...byHour.keys()].sort((a, b) => a - b);

  function formatHour(h: number) {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric" });
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>

        {hours.length === 0 ? (
          <div className="empty">Nothing scheduled this day.</div>
        ) : (
          <div className="day-breakdown">
            {hours.map((h) => (
              <div key={h} className="hour-row">
                <div className="hour-label">{formatHour(h)}</div>
                <div className="hour-events">
                  {byHour.get(h)!.map((e) => {
                    const meta = sportMeta(e, catalog, overrides);
                    const live = isLiveNow(e, now);
                    const time = new Date(e.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                    return (
                      <button
                        type="button"
                        key={`${e.sport}-${e.id}`}
                        className={`hour-event${live ? " is-live" : ""}`}
                        onClick={() => {
                          onClose();
                          onEventClick(e);
                        }}
                      >
                        {live ? <span className="live-dot-small" /> : <span className="dot" style={{ background: meta.color }} />}
                        <span className="hour-event-name">{e.name}</span>
                        {live ? <span className="live-badge">LIVE</span> : <span className="hour-event-time">{time}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
