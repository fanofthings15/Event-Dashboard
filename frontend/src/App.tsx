import { useCallback, useEffect, useMemo, useState } from "react";
import { useEvents } from "./useEvents";
import { useSettings } from "./SettingsContext";
import { useNow, formatCountdown } from "./countdown";
import { sportMeta } from "./sportMeta";
import { isLiveNow } from "./eventStatus";
import { sameDay } from "./calendarUtils";
import { CORE_SPORT_META, type NormalizedEvent } from "./types";
import SettingsDrawer from "./SettingsDrawer";
import CalendarView from "./CalendarView";
import CustomEventsPanel from "./CustomEventsPanel";
import EventDetailModal from "./EventDetailModal";

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

function matchesSearch(e: NormalizedEvent, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  if (e.name.toLowerCase().includes(q) || e.league.toLowerCase().includes(q)) return true;
  return Boolean(e.teams?.some((t) => t.name.toLowerCase().includes(q)));
}

function EventCard({
  e,
  now,
  catalog,
  overrides,
  onClick,
  onDismiss,
}: {
  e: NormalizedEvent;
  now: Date;
  catalog: ReturnType<typeof useSettings>["settings"]["esportsCatalog"];
  overrides: Record<string, string>;
  onClick: () => void;
  onDismiss?: () => void;
}) {
  const meta = sportMeta(e, catalog, overrides);
  const live = isLiveNow(e, now);
  return (
    <button type="button" className={`event-card${live ? " is-live" : ""}`} style={{ borderLeftColor: meta.color }} onClick={onClick}>
      <div className="event-top">
        <div className="event-top-left">
          <span className="sport-tag">{meta.label}</span>
          {e.region && <span className="region-chip">{e.region}</span>}
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="btn-x"
            aria-label="Dismiss"
            onClick={(evt) => {
              evt.stopPropagation();
              onDismiss();
            }}
          >
            ×
          </button>
        ) : live ? (
          <span className="live-badge">LIVE</span>
        ) : (
          <span className="countdown">{formatCountdown(e.startTime, now)}</span>
        )}
      </div>
      {e.followed && <span className="followed-chip">★ Your team</span>}
      {e.manuallyFollowed && <span className="manual-follow-chip">📌 Followed</span>}
      {e.teams && e.teams.length > 0 ? (
        <div className="event-teams">
          {e.teams.map((t) => (
            <div key={t.name} className="event-team-row">
              {t.imageUrl && <img src={t.imageUrl} alt="" className="event-team-logo" />}
              <span>{t.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="event-name">{e.name}</div>
      )}
      {e.seriesScore && <div className="event-series-score">{e.seriesScore}</div>}
      {live && e.liveDetail && <div className="event-live-detail">{e.liveDetail}</div>}
      <div className="event-meta">
        <span>{e.league}</span>
        <span>{formatTime(e.startTime)}</span>
      </div>
    </button>
  );
}

export default function App() {
  const { settings, loaded: settingsLoaded, save } = useSettings();

  // Applies the light/dark theme choice to the whole document.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  const notifyLive = useCallback(
    (e: NormalizedEvent) => {
      if (!settings.notifyOnLive) return;
      if (settings.notifyMode === "followed" && !e.followed && !e.manuallyFollowed) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const meta = sportMeta(e, settings.esportsCatalog, settings.sportColorOverrides);
      new Notification(`${e.name} is live`, { body: meta.label, tag: `${e.sport}-${e.id}` });
    },
    [settings.notifyOnLive, settings.notifyMode, settings.esportsCatalog, settings.sportColorOverrides]
  );

  const { events, allEvents, warnings, loading, refreshing, lastUpdated, refetch } = useEvents(
    settings.disabledCoreSources,
    settings.excludedLeagues,
    settings.frcRegions,
    settings.favoriteTeams,
    settings.followedEventIds,
    settings.pollIntervalSeconds * 1000,
    notifyLive
  );
  const now = useNow();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customEventsOpen, setCustomEventsOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"list" | "calendar" | "agenda" | "finished">("list");
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  function dismissFinished(e: NormalizedEvent) {
    const key = `${e.sport}-${e.id}`;
    if (settings.dismissedFinishedEventIds.includes(key)) return;
    save({ dismissedFinishedEventIds: [...settings.dismissedFinishedEventIds, key] });
  }

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

  function selectAll() {
    setActiveSports(new Set(availableSports));
  }
  function deselectAll() {
    setActiveSports(new Set());
  }

  const filtered = useMemo(
    () => events.filter((e) => isActive(e.sport) && matchesSearch(e, searchQuery)),
    [events, activeSports, availableSports, searchQuery]
  );
  const live = filtered.filter((e) => isLiveNow(e, now));
  const upcoming = filtered.filter((e) => !isLiveNow(e, now) && e.status !== "finished");
  const today = filtered.filter((e) => sameDay(new Date(e.startTime), now) && e.status !== "finished");
  const finished = filtered.filter(
    (e) => e.status === "finished" && !settings.dismissedFinishedEventIds.includes(`${e.sport}-${e.id}`)
  );

  const visibleWarnings = warnings.filter((w) => !dismissedWarnings.has(w));

  return (
    <div className="app">
      <header className="header">
        <h1>Event Dashboard</h1>
        <div className="header-actions">
          <button className="btn" onClick={() => setCustomEventsOpen(true)}>
            + Add Event
          </button>
          <div className="view-switcher">
            <button className={`btn small ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>
              List
            </button>
            <button className={`btn small ${view === "agenda" ? "active" : ""}`} onClick={() => setView("agenda")}>
              Today
            </button>
            <button className={`btn small ${view === "calendar" ? "active" : ""}`} onClick={() => setView("calendar")}>
              Calendar
            </button>
            <button className={`btn small ${view === "finished" ? "active" : ""}`} onClick={() => setView("finished")}>
              Finished
            </button>
          </div>
          <button className="btn" onClick={refetch} disabled={refreshing}>
            {refreshing ? "Syncing…" : "Resync"}
          </button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      {lastUpdated && <div className="last-updated">Last synced {lastUpdated.toLocaleTimeString()}</div>}

      <input
        className="search-input"
        type="search"
        placeholder="Search events, teams, leagues…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {settingsLoaded && (
        <div className="filters">
          <button className="btn small" onClick={selectAll}>
            Select all
          </button>
          <button className="btn small" onClick={deselectAll}>
            Deselect all
          </button>
          {availableSports.map((s) => {
            const meta = s === "custom" ? { label: "Custom", color: "#94a3b8" } : sportMeta({ sport: s } as NormalizedEvent, settings.esportsCatalog, settings.sportColorOverrides);
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
      ) : view === "calendar" ? (
        <CalendarView events={filtered} catalog={settings.esportsCatalog} overrides={settings.sportColorOverrides} now={now} onEventClick={setSelectedEvent} />
      ) : view === "agenda" ? (
        <section>
          <h2>Today</h2>
          {today.length === 0 ? (
            <div className="empty">Nothing today.</div>
          ) : (
            <div className="grid">
              {today.map((e) => (
                <EventCard key={`${e.sport}-${e.id}`} e={e} now={now} catalog={settings.esportsCatalog} overrides={settings.sportColorOverrides} onClick={() => setSelectedEvent(e)} />
              ))}
            </div>
          )}
        </section>
      ) : view === "finished" ? (
        <section>
          <h2>Finished</h2>
          <span className="hint" style={{ display: "block", marginBottom: 12 }}>
            Recently finished events stay here for a while so you can catch up — dismiss the ones you're done with.
          </span>
          {finished.length === 0 ? (
            <div className="empty">Nothing finished recently.</div>
          ) : (
            <div className="grid">
              {finished.map((e) => (
                <EventCard
                  key={`${e.sport}-${e.id}`}
                  e={e}
                  now={now}
                  catalog={settings.esportsCatalog}
                  overrides={settings.sportColorOverrides}
                  onClick={() => setSelectedEvent(e)}
                  onDismiss={() => dismissFinished(e)}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section>
            <h2>Live now</h2>
            {live.length === 0 ? (
              <div className="empty">Nothing live right now.</div>
            ) : (
              <div className="grid">
                {live.map((e) => (
                  <EventCard key={`${e.sport}-${e.id}`} e={e} now={now} catalog={settings.esportsCatalog} overrides={settings.sportColorOverrides} onClick={() => setSelectedEvent(e)} />
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
                  <EventCard key={`${e.sport}-${e.id}`} e={e} now={now} catalog={settings.esportsCatalog} overrides={settings.sportColorOverrides} onClick={() => setSelectedEvent(e)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} allEvents={allEvents} />}
      {customEventsOpen && <CustomEventsPanel onClose={() => setCustomEventsOpen(false)} />}
      {selectedEvent && (
        <EventDetailModal event={selectedEvent} now={now} catalog={settings.esportsCatalog} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
