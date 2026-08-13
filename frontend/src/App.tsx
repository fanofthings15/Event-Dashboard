import { useMemo, useState } from "react";
import { useEvents } from "./useEvents";
import { SPORT_LABEL, type NormalizedEvent, type Sport } from "./types";
import SettingsDrawer from "./SettingsDrawer";

const ALL_SPORTS = Object.keys(SPORT_LABEL) as Sport[];

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EventCard({ e }: { e: NormalizedEvent }) {
  return (
    <div className={`event-card status-${e.status}`}>
      <div className="event-top">
        <span className="sport-tag">{SPORT_LABEL[e.sport]}</span>
        {e.status === "live" && <span className="live-dot">LIVE</span>}
      </div>
      <div className="event-name">{e.name}</div>
      <div className="event-meta">
        <span>{e.league}</span>
        <span>{formatTime(e.startTime)}</span>
      </div>
    </div>
  );
}

export default function App() {
  const { events, warnings, loading } = useEvents();
  const [activeSports, setActiveSports] = useState<Set<Sport>>(new Set(ALL_SPORTS));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filtered = useMemo(() => events.filter((e) => activeSports.has(e.sport)), [events, activeSports]);
  const live = filtered.filter((e) => e.status === "live");
  const upcoming = filtered.filter((e) => e.status === "upcoming");

  function toggleSport(s: Sport) {
    setActiveSports((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Event Dashboard</h1>
        <button className="btn" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
      </header>

      <div className="filters">
        {ALL_SPORTS.map((s) => (
          <button key={s} className={`chip ${activeSports.has(s) ? "active" : ""}`} onClick={() => toggleSport(s)}>
            {SPORT_LABEL[s]}
          </button>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w, i) => (
            <div key={i} className="warning">
              {w}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <>
          <section>
            <h2>Live now</h2>
            {live.length === 0 ? (
              <div className="empty">Nothing live right now.</div>
            ) : (
              <div className="grid">
                {live.map((e) => (
                  <EventCard key={`${e.sport}-${e.id}`} e={e} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2>Upcoming</h2>
            {upcoming.length === 0 ? (
              <div className="empty">Nothing upcoming in the current data.</div>
            ) : (
              <div className="grid">
                {upcoming.map((e) => (
                  <EventCard key={`${e.sport}-${e.id}`} e={e} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
