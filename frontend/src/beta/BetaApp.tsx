import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useEvents, type NotifyReason } from "../useEvents";
import { useStandings } from "../useStandings";
import { useSettings } from "../SettingsContext";
import { useNow, formatCountdown } from "../countdown";
import { sportMeta } from "../sportMeta";
import { isLiveNow } from "../eventStatus";
import { formatEventClock } from "../dateFormat";
import { playNotificationPing } from "../notifySound";
import { isQuietNow, loadQuiet } from "../quietHours";
import { CORE_SPORT_META, type NormalizedEvent } from "../types";
import CalendarView from "../CalendarView";
import EventSheet from "./EventSheet";
import type { CustomEvent } from "../settingsTypes";
import EventDetailModal from "../EventDetailModal";
import StandingsView from "../StandingsView";
import { dayKey, dayLabel, eventKey, EventRow, GameTile, isMine, liveStatus, sideScores, subLine } from "./parts";
import BetaSettings from "./BetaSettings";
import "./beta.css";

const LiveScreen = lazy(() => import("../live/LiveScreen"));

// The redesign's working copy, at /beta: Rail II on a desktop, the Home
// layout on a phone. Same data, settings and detail/calendar/standings
// screens as the main dashboard; / stays the old UI until it's swapped over.

type View = "home" | "calendar" | "finished" | "standings" | "settings" | "live" | "more";

const FINISHED_SHELF_LIFE_DAYS = 7;
const UPCOMING_PAGE = 60;
const OFF_KEY = "beta-sources-off";

function useIsPhone(): boolean {
  const query = "(max-width: 820px)";
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

function loadOff(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(OFF_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

function matchesSearch(e: NormalizedEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return e.name.toLowerCase().includes(q) || e.league.toLowerCase().includes(q) || Boolean(e.teams?.some((t) => t.name.toLowerCase().includes(q)));
}

const Icon = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  live: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M10 9l5 3-5 3z" />
    </>
  ),
  finished: <path d="M20 6L9 17l-5-5" />,
  standings: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
};

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export default function BetaApp() {
  const { settings, loaded: settingsLoaded, save } = useSettings();
  const phone = useIsPhone();

  // The redesign is dark only.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.classList.add("b-body");
    return () => document.body.classList.remove("b-body");
  }, []);

  // Same in-tab chime as the dashboard: only for an event going live.
  const notifyEvent = useCallback(
    (e: NormalizedEvent, reason: NotifyReason) => {
      if (reason !== "live" || !settings.notifyOnLive) return;
      if (settings.notifyMode === "followed" && !isMine(e)) return;
      if (settings.notifySoundEnabled && !isQuietNow(loadQuiet(), settings.timezone)) playNotificationPing();
    },
    [settings.notifyOnLive, settings.notifyMode, settings.notifySoundEnabled, settings.timezone]
  );

  const { events, allEvents, warnings, loading, refreshing, lastUpdated, isOffline, refetch } = useEvents(
    settings.disabledCoreSources,
    settings.excludedLeagues,
    settings.frcRegions,
    settings.favoriteTeams,
    settings.followedEventIds,
    settings.snoozedEventIds,
    settings.notifyLeadMinutes,
    settings.pollIntervalSeconds * 1000,
    notifyEvent
  );
  const standings = useStandings(settings.disabledCoreSources);
  const now = useNow();
  const tz = settings.timezone;

  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<NormalizedEvent | null>(null);
  const [livePin, setLivePin] = useState<string | null>(null);
  // the new/edit custom event form: a date to start on, or an event to edit
  const [sheet, setSheet] = useState<{ editing?: CustomEvent; date?: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  // Sources switched off here are a per-device view filter, not the
  // settings that stop fetching a source.
  const [off, setOff] = useState<Set<string>>(loadOff);
  const setOffSaved = (next: Set<string>) => {
    setOff(next);
    try {
      localStorage.setItem(OFF_KEY, JSON.stringify([...next]));
    } catch {
      /* per-device convenience only */
    }
  };

  const meta = useCallback((e: NormalizedEvent) => sportMeta(e, settings.esportsCatalog, settings.sportColorOverrides), [settings.esportsCatalog, settings.sportColorOverrides]);

  const sources = useMemo(() => {
    const core = Object.keys(CORE_SPORT_META).filter((s) => !settings.disabledCoreSources.includes(s));
    const esports = settings.esportsCatalog.filter((g) => settings.enabledEsportsGames.includes(g.slug)).map((g) => g.sport);
    const custom = settings.customEvents.length > 0 ? ["custom"] : [];
    return [...core, ...esports, ...custom].map((sport) => {
      const m = sport === "custom" ? { label: "Custom", color: "#94a3b8" } : sportMeta({ sport } as NormalizedEvent, settings.esportsCatalog, settings.sportColorOverrides);
      return { sport, label: m.label, color: m.color, count: events.filter((e) => e.sport === sport && e.status !== "finished").length };
    });
  }, [settings, events]);

  // "Show all": every game, ignoring the source switches here and the
  // league/region filters in settings, without changing either.
  const [showAll, setShowAll] = useState(false);
  const hiddenCount = useMemo(() => {
    const shown = new Set(events.filter((e) => !off.has(e.sport)).map(eventKey));
    return allEvents.filter((e) => e.status !== "finished" && !shown.has(eventKey(e))).length;
  }, [events, allEvents, off]);
  const filtered = useMemo(() => (showAll ? allEvents : events.filter((e) => !off.has(e.sport))).filter((e) => matchesSearch(e, search)), [showAll, allEvents, events, off, search]);
  const live = useMemo(() => filtered.filter((e) => isLiveNow(e, now)).sort((a, b) => a.startTime.localeCompare(b.startTime)), [filtered, now]);
  const mineLive = live.filter(isMine);
  const otherLive = live.filter((e) => !isMine(e));
  const upcoming = useMemo(() => filtered.filter((e) => !isLiveNow(e, now) && e.status !== "finished").sort((a, b) => a.startTime.localeCompare(b.startTime)), [filtered, now]);
  const mineNext = upcoming.filter(isMine).slice(0, 6);
  const finished = useMemo(
    () =>
      filtered
        .filter((e) => e.status === "finished" && !settings.dismissedFinishedEventIds.includes(eventKey(e)) && (now.getTime() - new Date(e.endTime ?? e.startTime).getTime()) / 86_400_000 <= FINISHED_SHELF_LIFE_DAYS)
        .sort((a, b) => (b.endTime ?? b.startTime).localeCompare(a.endTime ?? a.startTime)),
    [filtered, settings.dismissedFinishedEventIds, now]
  );
  const visibleWarnings = warnings.filter((w) => !dismissedWarnings.has(w));

  // other live games grouped by source, biggest group first (an NFL Sunday slate)
  const liveGroups = useMemo(() => {
    const groups = new Map<string, NormalizedEvent[]>();
    for (const e of otherLive) groups.set(e.sport, [...(groups.get(e.sport) ?? []), e]);
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [otherLive]);

  // your own (custom) events open in the edit form; everything else in the detail view
  const open = (e: NormalizedEvent) => {
    const own = e.sport === "custom" ? settings.customEvents.find((c) => c.id === e.id) : undefined;
    if (own) setSheet({ editing: own });
    else setSelected(e);
  };
  const dismiss = (e: NormalizedEvent) => save({ dismissedFinishedEventIds: [...settings.dismissedFinishedEventIds, eventKey(e)] });
  const watchLive = (e: NormalizedEvent) => {
    setLivePin(eventKey(e));
    setSelected(null);
    setView("live");
  };
  const goToTeam = (team: string) => {
    setSearch(team);
    setSearchOpen(true);
    setSelected(null);
    setView("home");
  };
  const synced = lastUpdated ? formatEventClock(lastUpdated.toISOString(), tz) : "—";

  if (view === "live") {
    return (
      <Suspense fallback={null}>
        <LiveScreen
          onBack={() => {
            setLivePin(null);
            setView("home");
          }}
          pin={livePin ?? undefined}
        />
      </Suspense>
    );
  }

  // ---------- pieces used by both layouts ----------

  const showAllButton = (
    <button
      type="button"
      className={`b-showall${showAll ? " on" : ""}`}
      aria-pressed={showAll}
      title="Show every game, including sources and leagues you've filtered out"
      onClick={() => setShowAll((v) => !v)}
    >
      <Svg size={18}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </Svg>
      {showAll ? "Showing all" : hiddenCount > 0 ? `Show all · ${hiddenCount} hidden` : "Show all"}
    </button>
  );

  const filtersOffBanner = showAll && (
    <div className="b-filters-off" role="status">
      <span>Filters are off: showing every game, including sources and leagues you've hidden.</span>
      <button type="button" onClick={() => setShowAll(false)}>
        Turn filters back on
      </button>
    </div>
  );

  const warningsBlock = visibleWarnings.length > 0 && (
    <div className="b-warnings">
      {visibleWarnings.map((w) => (
        <div key={w} className="b-warning">
          <span>{w}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setDismissedWarnings((p) => new Set(p).add(w))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );

  const finishedView = (
    <section className="b-section">
      <h1 className="b-h1">Finished</h1>
      {finished.length === 0 ? (
        <p className="b-empty">Nothing finished in the last week.</p>
      ) : (
        <div className="b-panel">
          {finished.map((e) => {
            const s = sideScores(e);
            return (
              <div key={eventKey(e)} className="b-row-wrap">
                <EventRow e={e} color={meta(e).color} left={new Date(e.endTime ?? e.startTime).toLocaleDateString(undefined, { weekday: "short", ...(tz ? { timeZone: tz } : {}) })} sub={subLine(e, meta(e).label)} right={s ? `${s[0]}–${s[1]}` : undefined} onOpen={() => open(e)} logos={!phone} />
                <button type="button" className="b-dismiss" aria-label={`Dismiss ${e.name}`} onClick={() => dismiss(e)}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const calendarView = (
    <section className="b-section b-legacy">
      <h1 className="b-h1">Calendar</h1>
      <CalendarView events={filtered} catalog={settings.esportsCatalog} overrides={settings.sportColorOverrides} timezone={tz} now={now} onEventClick={open} />
    </section>
  );

  const settingsView = <BetaSettings allEvents={allEvents} phone={phone} onNewEvent={() => setSheet({})} onEditEvent={(c) => setSheet({ editing: c })} />;

  const standingsView = (
    <section className="b-section b-legacy">
      <h1 className="b-h1">Standings</h1>
      <StandingsView standingsBySport={standings.standingsBySport} loading={standings.loading} loaded={standings.loaded} onRefresh={standings.refetch} />
    </section>
  );

  const sourceToggles = (
    <>
      {sources.map((s) => {
        const on = !off.has(s.sport);
        return (
          <button
            key={s.sport}
            type="button"
            className={`b-source${on ? "" : " off"}`}
            aria-pressed={on}
            onClick={() => {
              const next = new Set(off);
              if (on) next.add(s.sport);
              else next.delete(s.sport);
              setOffSaved(next);
            }}
          >
            <span className="b-swatch" style={{ borderColor: s.color, background: on ? s.color : "transparent" }} />
            <span className="b-ellipsis">{s.label}</span>
            <span className="b-count">{s.count}</span>
          </button>
        );
      })}
    </>
  );

  const modals = (
    <>
      {sheet && <EventSheet editing={sheet.editing} date={sheet.date} onClose={() => setSheet(null)} onSaved={refetch} />}
      {selected && <EventDetailModal event={selected} now={now} catalog={settings.esportsCatalog} onClose={() => setSelected(null)} onTeamClick={goToTeam} onWatchLive={watchLive} />}
    </>
  );

  // ---------- phone: the Home layout ----------

  if (phone) {
    return (
      <div className="b-app b-phone">
        <main className="b-phone-main">
          {filtersOffBanner}
          {view === "home" && (
            <PhoneHome
              now={now}
              tz={tz}
              synced={synced}
              search={search}
              setSearch={setSearch}
              searchOpen={searchOpen}
              setSearchOpen={setSearchOpen}
              warnings={warningsBlock}
              showAllButton={showAllButton}
              loading={loading || !settingsLoaded}
              mineLive={mineLive}
              mineNext={mineNext}
              onNewEvent={(date) => setSheet({ date })}
              live={live}
              upcoming={upcoming}
              meta={meta}
              open={open}
            />
          )}
          {view === "calendar" && calendarView}
          {view === "finished" && finishedView}
          {view === "standings" && standingsView}
          {view === "settings" && settingsView}
          {view === "more" && (
            <section className="b-section">
              <h1 className="b-h1">More</h1>
              <div className="b-panel">
                <button type="button" className="b-menu-row" onClick={() => setView("standings")}>
                  <Svg>{Icon.standings}</Svg> Standings
                </button>
                <button type="button" className="b-menu-row" onClick={() => setView("settings")}>
                  <Svg>{Icon.settings}</Svg> Settings
                </button>
                <button type="button" className="b-menu-row" onClick={() => setSheet({})}>
                  <Svg>{Icon.plus}</Svg> New event
                </button>
                <button type="button" className="b-menu-row" onClick={refetch} disabled={refreshing}>
                  <Svg>{Icon.finished}</Svg> {refreshing ? "Syncing…" : `Resync · last ${synced}`}
                  {isOffline && <span className="b-muted b-small"> · offline</span>}
                </button>
                <a className="b-menu-row" href="/">
                  <Svg>{Icon.home}</Svg> Back to the current dashboard
                </a>
              </div>
              <h2 className="b-h2">Sources on this device</h2>
              {showAllButton}
              <div className="b-panel b-sources-phone">{sourceToggles}</div>
            </section>
          )}
        </main>
        <nav className="b-tabbar" aria-label="Main">
          {(
            [
              ["home", "Home", Icon.home],
              ["calendar", "Calendar", Icon.calendar],
              ["live", "Live", Icon.live],
              ["finished", "Finished", Icon.finished],
              ["more", "More", Icon.more],
            ] as [View, string, ReactNode][]
          ).map(([v, label, icon]) => {
            const active = view === v || (v === "more" && (view === "standings" || view === "settings"));
            return (
              <button
                key={v}
                type="button"
                className={`b-tab${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (v === "live") setLivePin(null);
                  setView(v);
                  window.scrollTo(0, 0);
                }}
              >
                <Svg size={22}>{icon}</Svg>
                {label}
                {v === "live" && live.length > 0 && <span className="b-tab-dot" />}
              </button>
            );
          })}
        </nav>
        {modals}
      </div>
    );
  }

  // ---------- desktop: Rail II ----------

  return (
    <div className="b-app b-desktop">
      <nav className="b-rail" aria-label="Main">
        <div className="b-brand">
          <span className="b-brand-mark" />
          Events
        </div>
        <div className="b-rail-nav">
          {(
            [
              ["home", "Home", Icon.home],
              ["calendar", "Calendar", Icon.calendar],
              ["live", "Live display", Icon.live],
              ["finished", "Finished", Icon.finished],
              ["standings", "Standings", Icon.standings],
            ] as [View, string, ReactNode][]
          ).map(([v, label, icon]) => (
            <button
              key={v}
              type="button"
              className={`b-nav${view === v ? " active" : ""}`}
              aria-current={view === v ? "page" : undefined}
              onClick={() => {
                if (v === "live") setLivePin(null);
                setView(v);
              }}
            >
              <Svg size={18}>{icon}</Svg>
              {label}
              {v === "live" && live.length > 0 && <span className="b-badge">{live.length}</span>}
            </button>
          ))}
          <button type="button" className="b-nav b-nav-new" onClick={() => setSheet({})}>
            <Svg size={18}>{Icon.plus}</Svg>
            New event
          </button>
        </div>
        <div className="b-rail-sources">
          <div className="b-rail-label">
            Sources
            <span>
              <button type="button" onClick={() => setOffSaved(new Set())}>
                All
              </button>
              <button type="button" onClick={() => setOffSaved(new Set(sources.map((s) => s.sport)))}>
                None
              </button>
            </span>
          </div>
          {showAllButton}
          {sourceToggles}
        </div>
        <div className="b-rail-foot">
          <button type="button" className={`b-nav${view === "settings" ? " active" : ""}`} aria-current={view === "settings" ? "page" : undefined} onClick={() => setView("settings")}>
            <Svg size={18}>{Icon.settings}</Svg>
            Settings
          </button>
          <a className="b-nav" href="/">
            Current dashboard ↗
          </a>
        </div>
      </nav>

      <main className="b-main">
        <div className="b-topbar">
          <label className="b-search">
            <Svg size={18}>{Icon.search}</Svg>
            <input type="search" aria-label="Search" placeholder="Search teams, leagues, events" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <span className="b-muted b-small">
            {isOffline ? "Offline · cached " : "Synced "}
            {synced}
          </span>
          <div className="b-menu-wrap">
            <button type="button" className="b-iconbtn" aria-label="More: resync, add a custom event" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              <Svg size={18}>{Icon.more}</Svg>
            </button>
            {menuOpen && (
              <div className="b-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    refetch();
                  }}
                  disabled={refreshing}
                >
                  {refreshing ? "Syncing…" : "Resync now"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setSheet({});
                  }}
                >
                  Add a custom event
                </button>
              </div>
            )}
          </div>
        </div>

        {filtersOffBanner}
        {warningsBlock}

        {view === "home" && (
          <>
            <section className="b-section">
              <div className="b-section-head">
                <h2 className="b-h1">Live now</h2>
                <span className="b-muted">{live.length === 1 ? "1 game" : `${live.length} games`}</span>
                {live.length > 0 && (
                  <button type="button" className="b-link" onClick={() => setView("live")}>
                    Open live display →
                  </button>
                )}
              </div>
              {loading || !settingsLoaded ? (
                <p className="b-empty">Loading…</p>
              ) : live.length === 0 ? (
                <p className="b-empty">Nothing live right now.</p>
              ) : (
                <>
                  {mineLive.length > 0 && (
                    <div className="b-tilegrid">
                      {mineLive.map((e) => (
                        <GameTile key={eventKey(e)} e={e} color={meta(e).color} label={meta(e).label} live now={now} tz={tz} onOpen={() => open(e)} />
                      ))}
                    </div>
                  )}
                  {liveGroups.map(([sport, list]) => {
                    const m = meta(list[0]);
                    return <LiveGroup key={sport} label={m.label} color={m.color} list={list} meta={meta} open={open} now={now} tz={tz} showHead={liveGroups.length > 1 || mineLive.length > 0} />;
                  })}
                </>
              )}
            </section>

            {mineNext.length > 0 && (
              <section className="b-section">
                <h2 className="b-h1">Your teams next</h2>
                <div className="b-tilegrid">
                  {mineNext.slice(0, 4).map((e) => (
                    <GameTile key={eventKey(e)} e={e} color={meta(e).color} label={meta(e).label} live={false} now={now} tz={tz} onOpen={() => open(e)} />
                  ))}
                </div>
              </section>
            )}

            <UpcomingByDay upcoming={upcoming} now={now} tz={tz} meta={meta} open={open} />
          </>
        )}
        {view === "calendar" && calendarView}
        {view === "finished" && finishedView}
        {view === "standings" && standingsView}
        {view === "settings" && settingsView}
      </main>
      {modals}
    </div>
  );
}

type MetaFn = (e: NormalizedEvent) => { label: string; color: string };

function LiveGroup({ label, color, list, meta, open, now, tz, showHead }: { label: string; color: string; list: NormalizedEvent[]; meta: MetaFn; open: (e: NormalizedEvent) => void; now: Date; tz: string; showHead: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 8);
  return (
    <div className="b-group">
      {showHead && (
        <div className="b-group-head">
          <span className="b-swatch" style={{ background: color, borderColor: color }} />
          <span className="b-strong">{label}</span>
          <span className="b-muted b-small">{list.length} live</span>
        </div>
      )}
      <div className="b-tilegrid">
        {shown.map((e) => (
          <GameTile key={eventKey(e)} e={e} color={meta(e).color} label={meta(e).label} live now={now} tz={tz} onOpen={() => open(e)} />
        ))}
      </div>
      {list.length > 8 && (
        <button type="button" className="b-more b-panel" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}

function UpcomingByDay({ upcoming, now, tz, meta, open }: { upcoming: NormalizedEvent[]; now: Date; tz: string; meta: MetaFn; open: (e: NormalizedEvent) => void }) {
  const [limit, setLimit] = useState(UPCOMING_PAGE);
  const days = useMemo(() => {
    const map = new Map<string, NormalizedEvent[]>();
    for (const e of upcoming.slice(0, limit)) {
      const k = dayKey(e.startTime, tz);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [upcoming, limit, tz]);
  return (
    <section className="b-section">
      <h2 className="b-h1">Upcoming</h2>
      {upcoming.length === 0 && <p className="b-empty">Nothing upcoming in the current data.</p>}
      {days.map(([k, list]) => (
        <div key={k} className="b-group">
          <div className="b-group-head b-strong">{dayLabel(k, now, tz)}</div>
          <div className="b-tilegrid">
            {list.map((e) => (
              <GameTile key={eventKey(e)} e={e} color={meta(e).color} label={meta(e).label} live={false} now={now} tz={tz} onOpen={() => open(e)} />
            ))}
          </div>
        </div>
      ))}
      {upcoming.length > limit && (
        <button type="button" className="b-more b-panel" onClick={() => setLimit((l) => l + UPCOMING_PAGE)}>
          Show more ({upcoming.length - limit} left)
        </button>
      )}
    </section>
  );
}

function PhoneHome({
  now,
  tz,
  synced,
  search,
  setSearch,
  searchOpen,
  setSearchOpen,
  warnings,
  showAllButton,
  loading,
  mineLive,
  mineNext,
  live,
  upcoming,
  meta,
  open,
  onNewEvent,
}: {
  now: Date;
  tz: string;
  synced: string;
  search: string;
  setSearch: (s: string) => void;
  searchOpen: boolean;
  setSearchOpen: (o: boolean) => void;
  warnings: ReactNode;
  showAllButton: ReactNode;
  loading: boolean;
  mineLive: NormalizedEvent[];
  mineNext: NormalizedEvent[];
  live: NormalizedEvent[];
  upcoming: NormalizedEvent[];
  meta: MetaFn;
  open: (e: NormalizedEvent) => void;
  onNewEvent: (date: string) => void;
}) {
  // "Also live": every game by default, a sport tab to narrow it
  const [tab, setTab] = useState<string>("all");
  const others = live.filter((e) => !isMine(e));
  const bySport = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of others) m.set(e.sport, (m.get(e.sport) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [others]);
  const shownOthers = tab === "all" ? others : others.filter((e) => e.sport === tab);

  // this week: today and the next six days
  const week = useMemo(() => {
    const out: { key: string; dow: string; n: string; colors: string[]; list: NormalizedEvent[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 86_400_000);
      const key = dayKey(d, tz);
      const list = upcoming.filter((e) => dayKey(e.startTime, tz) === key);
      const colors = [...new Set(list.map((e) => meta(e).color))].slice(0, 3);
      out.push({ key, dow: i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short", ...(tz ? { timeZone: tz } : {}) }), n: d.toLocaleDateString(undefined, { day: "numeric", ...(tz ? { timeZone: tz } : {}) }), colors, list });
    }
    return out;
  }, [now, tz, upcoming, meta]);
  const [day, setDay] = useState(0);
  const dayList = week[day]?.list ?? [];

  return (
    <div className="b-phone-home">
      <header className="b-phone-head">
        <h1 className="b-h1">Home</h1>
        <span className="b-muted b-small">{synced}</span>
        {showAllButton}
        <button type="button" className="b-iconbtn" aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}>
          <Svg>{Icon.search}</Svg>
        </button>
      </header>
      {(searchOpen || search) && (
        <label className="b-search">
          <Svg size={18}>{Icon.search}</Svg>
          <input type="search" aria-label="Search" placeholder="Search teams, leagues, events" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus={!search} />
        </label>
      )}
      {warnings}
      {loading ? (
        <p className="b-empty">Loading…</p>
      ) : (
        <>
          {(mineLive.length > 0 || mineNext.length > 0) && (
            <section className="b-section">
              <h2 className="b-h2">Your teams</h2>
              <div className="b-panel">
                {mineLive.map((e) => {
                  const s = sideScores(e);
                  return <EventRow key={eventKey(e)} e={e} color={meta(e).color} left={liveStatus(e)} leftLive sub={subLine(e, meta(e).label)} right={s ? `${s[0]}–${s[1]}` : undefined} onOpen={() => open(e)} />;
                })}
                {mineNext.slice(0, 4).map((e) => (
                  <EventRow key={eventKey(e)} e={e} color={meta(e).color} left={formatEventClock(e.startTime, tz)} sub={`${dayLabel(dayKey(e.startTime, tz), now, tz)} · ${meta(e).label}`} right={formatCountdown(e.startTime, now).replace(/^in /, "")} onOpen={() => open(e)} />
                ))}
              </div>
            </section>
          )}

          <section className="b-section">
            <h2 className="b-h2">{mineLive.length > 0 ? "Also live" : "Live now"}</h2>
            {others.length === 0 ? (
              <p className="b-empty">Nothing else live right now.</p>
            ) : (
              <>
                <div className="b-tabs" role="tablist" aria-label="Sport">
                  <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>
                    All {others.length}
                  </button>
                  {bySport.map(([sport, n]) => {
                    const m = meta(others.find((e) => e.sport === sport)!);
                    return (
                      <button key={sport} type="button" role="tab" aria-selected={tab === sport} className={tab === sport ? "active" : ""} onClick={() => setTab(sport)}>
                        <span className="b-swatch" style={{ background: m.color, borderColor: m.color }} />
                        {m.label} {n}
                      </button>
                    );
                  })}
                </div>
                <div className="b-panel">
                  {shownOthers.map((e) => {
                    const s = sideScores(e);
                    return <EventRow key={eventKey(e)} e={e} color={meta(e).color} left={liveStatus(e)} leftLive sub={subLine(e, meta(e).label)} right={s ? `${s[0]}–${s[1]}` : undefined} onOpen={() => open(e)} />;
                  })}
                </div>
              </>
            )}
          </section>

          <section className="b-section">
            <h2 className="b-h2">This week</h2>
            <div className="b-week" role="tablist" aria-label="Day">
              {week.map((d, i) => (
                <button key={d.key} type="button" role="tab" aria-selected={day === i} className={day === i ? "active" : ""} onClick={() => setDay(i)}>
                  <span className="b-muted b-small">{d.dow}</span>
                  <span className="b-strong">{d.n}</span>
                  <span className="b-dots">
                    {d.colors.map((c) => (
                      <span key={c} style={{ background: c }} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
            {dayList.length === 0 ? (
              <p className="b-empty">Nothing else on {day === 0 ? "today" : "this day"}.</p>
            ) : (
              <div className="b-panel">
                {dayList.slice(0, 40).map((e) => (
                  <EventRow key={eventKey(e)} e={e} color={meta(e).color} left={formatEventClock(e.startTime, tz)} sub={subLine(e, meta(e).label)} onOpen={() => open(e)} />
                ))}
              </div>
            )}
            <button type="button" className="b-add-day" onClick={() => onNewEvent(week[day].key)}>
              + Add an event on {day === 0 ? "today" : week[day].dow}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
