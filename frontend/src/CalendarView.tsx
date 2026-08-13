import { useMemo, useState } from "react";
import type { NormalizedEvent } from "./types";
import type { EsportsGame } from "./settingsTypes";
import { sportMeta } from "./sportMeta";
import { buildMonthGrid, sameDay } from "./calendarUtils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PER_DAY = 4;

interface Props {
  events: NormalizedEvent[];
  catalog: EsportsGame[];
}

export default function CalendarView({ events, catalog }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, NormalizedEvent[]>();
    for (const e of events) {
      const d = new Date(e.startTime);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const today = new Date();

  return (
    <div className="calendar">
      <div className="calendar-nav">
        <button className="btn" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
          ‹
        </button>
        <span className="calendar-title">
          {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
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
          const shown = dayEvents.slice(0, MAX_PER_DAY);
          const extra = dayEvents.length - shown.length;
          return (
            <div
              key={i}
              className={`calendar-cell ${cell.inMonth ? "" : "outside"} ${sameDay(cell.date, today) ? "is-today" : ""}`}
            >
              <div className="calendar-date">{cell.date.getDate()}</div>
              <div className="calendar-events">
                {shown.map((e) => {
                  const meta = sportMeta(e, catalog);
                  return (
                    <div key={`${e.sport}-${e.id}`} className="calendar-event" title={e.name}>
                      <span className="dot" style={{ background: meta.color }} />
                      <span className="calendar-event-name">{e.name}</span>
                    </div>
                  );
                })}
                {extra > 0 && <div className="calendar-more">+{extra} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
