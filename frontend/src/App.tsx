import { useMemo, useState } from "react";
import { useEvents } from "./useEvents";
import { useNow, formatCountdown } from "./countdown";
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

function EventCard({ e, now }: { e: NormalizedEvent; now: Date }) {
  return (
    <div className={`event-card sport-${e.sport} status-${e.status}`}>
      <div className="event-top">
        <span className="sport-tag">{SPORT_LABEL[e.sport]}</span>
        {e.status === "live" ? (
          <span className="live-dot">LIVE</span>
        ) : (
          <span className="countdown">{formatCountdown(e.startTime, now)}</span>
        )}
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
  const { events, warnings, loading, refreshing, lastUpdated, refetch } = useEvents();
  const now = useNow();
  const [activeSports, setActiveSports] = useState<Set<Sport>>(new Set(ALL_SPORTS));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filtered = useMemo(() => events.filter((e) => activeSports.has(e.sport)), [events, activeSports]);
  const live = filtered.filter((e) => e.status === "live");
  // Already sorted soonest-first by useEvents; upcoming keeps that order.
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
        <div className="header-actions">
          <button className="btn" onClick={refetch} disabled={refreshing}>
            {refreshing ? "Syncing…" : "Resync"}
          </button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      {lastUpdated && (
        <div className="last-updated">Last synced {lastUpdated.toLocaleTimeString()}</div>
      )}

      <div className="filters">
        {ALL_SPORTS.map((s) => (
          <button
            key={s}
            className={`chip chip-${s} ${activeSports.has(s) ? "active" : ""}`}
            onClick={() => toggleSport(s)}
          >
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
                  <EventCard key={`${e.sport}-${e.id}`} e={e} now={now} />
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
                  <EventCard key={`${e.sport}-${e.id}`} e={e} now={now} />
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
