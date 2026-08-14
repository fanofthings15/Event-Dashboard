import { useMemo, useState } from "react";
import type { NormalizedEvent } from "./types";
import type { EsportsGame } from "./settingsTypes";
import { sportMeta } from "./sportMeta";
import { isLiveNow } from "./eventStatus";
import { buildMonthGrid, sameDay } from "./calendarUtils";
import DayDetailModal from "./DayDetailModal";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_GROUPS_PER_DAY = 4;

interface Props {
  events: NormalizedEvent[];
  catalog: EsportsGame[];
  overrides: Record<string, string>;
  timezone: string;
  now: Date;
  onEventClick: (e: NormalizedEvent) => void;
}

interface SportGroup {
  sport: string;
  label: string;
  color: string;
  events: NormalizedEvent[];
}

function groupBySport(dayEvents: NormalizedEvent[], catalog: EsportsGame[], overrides: Record<string, string>): SportGroup[] {
  const map = new Map<string, SportGroup>();
  for (const e of dayEvents) {
    const meta = sportMeta(e, catalog, overrides);
    if (!map.has(e.sport)) map.set(e.sport, { sport: e.sport, label: meta.label, color: meta.color, events: [] });
    map.get(e.sport)!.events.push(e);
  }
  return [...map.values()];
}

export default function CalendarView({ events, catalog, overrides, timezone, now, onEventClick }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const liveNow = useMemo(() => events.filter((e) => isLiveNow(e, now)), [events, now]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, NormalizedEvent[]>();
    for (const e of events) {
      const key = new Date(e.startTime).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const today = new Date();
  const selectedDayEvents = selectedDay ? eventsByDay.get(selectedDay.toDateString()) ?? [] : [];

  return (
    <div className="calendar">
      {liveNow.length > 0 && (
        <div className="calendar-live-strip">
          <span className="live-badge">LIVE</span>
          {liveNow.map((e) => {
            const meta = sportMeta(e, catalog, overrides);
            return (
              <button key={`${e.sport}-${e.id}`} type="button" className="calendar-live-chip" onClick={() => onEventClick(e)}>
                <span className="dot" style={{ background: meta.color }} />
                {e.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="calendar-nav">
        <button className="btn" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
          ‹
        </button>
        <span className="calendar-title">{viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button className="btn" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
          ›
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}

        {weeks.flat().map((cell, i) => {
          const dayEvents = eventsByDay.get(cell.date.toDateString()) ?? [];
          const groups = groupBySport(dayEvents, catalog, overrides);
          const shown = groups.slice(0, MAX_GROUPS_PER_DAY);
          const extraGroups = groups.length - shown.length;

          return (
            <button
              key={i}
              type="button"
              className={`calendar-cell ${cell.inMonth ? "" : "outside"} ${sameDay(cell.date, today) ? "is-today" : ""}`}
              onClick={() => dayEvents.length > 0 && setSelectedDay(cell.date)}
              disabled={dayEvents.length === 0}
            >
              <div className="calendar-date">{cell.date.getDate()}</div>
              <div className="calendar-events">
                {shown.map((g) => {
                  const groupLive = g.events.some((e) => isLiveNow(e, now));
                  return (
                    <div
                      key={g.sport}
                      className={`calendar-event${groupLive ? " is-live" : ""}`}
                      title={g.events.length === 1 ? g.events[0].name : `${g.events.length}x ${g.label}`}
                    >
                      {groupLive ? <span className="live-dot-small" /> : <span className="dot" style={{ background: g.color }} />}
                      <span className="calendar-event-name">
                        {g.events.length === 1 ? g.events[0].name : `${g.events.length}x ${g.label}`}
                      </span>
                    </div>
                  );
                })}
                {extraGroups > 0 && <div className="calendar-more">+{extraGroups} more</div>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <DayDetailModal
          date={selectedDay}
          events={selectedDayEvents}
          catalog={catalog}
          overrides={overrides}
          timezone={timezone}
          now={now}
          onClose={() => setSelectedDay(null)}
          onEventClick={onEventClick}
        />
      )}
    </div>
  );
}
