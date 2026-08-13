import { useMemo, useState } from "react";
import { useEvents } from "./useEvents";
import { useSettings } from "./useSettings";
import { useNow, formatCountdown } from "./countdown";
import { sportMeta } from "./sportMeta";
import { CORE_SPORT_META, type NormalizedEvent } from "./types";
import SettingsDrawer from "./SettingsDrawer";

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

function EventCard({ e, now, catalog }: { e: NormalizedEvent; now: Date; catalog: ReturnType<typeof useSettings>["settings"]["esportsCatalog"] }) {
  const meta = sportMeta(e, catalog);
  return (
    <div className={`event-card${e.status === "live" ? " is-live" : ""}`} style={{ borderLeftColor: meta.color }}>
      <div className="event-top">
        <span className="sport-tag">{meta.label}</span>
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
  const { settings, loaded: settingsLoaded } = useSettings();
  const { events, warnings, loading, refreshing, lastUpdated, refetch } = useEvents(
    settings.disabledCoreSources,
    settings.excludedLeagues
  );
  const now = useNow();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  // Every sport currently enabled, in a stable order: core sources first,
  // then enabled esports titles, then "custom" if any custom events exist.
  const availableSports = useMemo(() => {
    const core = Object.keys(CORE_SPORT_META).filter((s) => !settings.disabledCoreSources.includes(s));
    const esports = settings.esportsCatalog.filter((g) => settings.enabledEsportsGames.includes(g.slug)).map((g) => g.sport);
    const custom = settings.customEvents.length > 0 ? ["custom"] : [];
    return [...core, ...esports, ...custom];
  }, [settings]);

  const [activeSports, setActiveSports] = useState<Set<string> | null>(null); // null = "all"
  const isActive = (sport: string) => activeSports === null || activeSports.has(sport);

  function toggleSport(sport: string) {
    setActiveSports((prev) => {
      const base = prev ?? new Set(availableSports);
      const next = new Set(base);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  }

  const filtered = useMemo(() => events.filter((e) => isActive(e.sport)), [events, activeSports, availableSports]);
  const live = filtered.filter((e) => e.status === "live");
  const upcoming = filtered.filter((e) => e.status === "upcoming");

  const visibleWarnings = warnings.filter((w) => !dismissedWarnings.has(w));

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

      {lastUpdated && <div className="last-updated">Last synced {lastUpdated.toLocaleTimeString()}</div>}

      {settingsLoaded && (
        <div className="filters">
          {availableSports.map((s) => {
            const meta = s === "custom" ? { label: "Custom", color: "#94a3b8" } : sportMeta({ sport: s } as NormalizedEvent, settings.esportsCatalog);
            return (
              <button
                key={s}
                className={`chip ${isActive(s) ? "active" : ""}`}
                style={isActive(s) ? { borderColor: meta.color, background: `${meta.color}26`, color: "#fff" } : undefined}
                onClick={() => toggleSport(s)}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {visibleWarnings.length > 0 && (
        <div className="warnings">
          {visibleWarnings.map((w, i) => (
            <div key={i} className="warning">
              <span>{w}</span>
              <button
                className="btn-x"
                aria-label="Dismiss"
                onClick={() => setDismissedWarnings((prev) => new Set(prev).add(w))}
              >
                ×
              </button>
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
                  <EventCard key={`${e.sport}-${e.id}`} e={e} now={now} catalog={settings.esportsCatalog} />
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
                  <EventCard key={`${e.sport}-${e.id}`} e={e} now={now} catalog={settings.esportsCatalog} />
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
