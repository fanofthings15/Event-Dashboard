import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "../SettingsContext";
import { useEvents } from "../useEvents";
import { sportMeta } from "../sportMeta";
import type { NormalizedEvent } from "../types";
import { ESPORTS_SPORTS, eventKey, LIVE_VIEW_SPORTS, selectLiveEvent } from "./selectLiveEvent";
import { useLiveDetail } from "./useLiveDetail";
import { embeddableStream } from "./Stream";
import type { BaseballState, BasketballState, F1State, FootballState, FrcState, HockeyState } from "./liveTypes";
import FootballView from "./views/FootballView";
import BasketballView from "./views/BasketballView";
import HockeyView from "./views/HockeyView";
import BaseballView from "./views/BaseballView";
import F1View from "./views/F1View";
import FrcView from "./views/FrcView";
import EsportsView from "./views/EsportsView";
import IdleView from "./views/IdleView";
import { LiveFrame, Message } from "./Layout";
import "./live.css";

// Full-screen display at /live, meant for a dedicated tablet or monitor.
// Which game it shows is decided by selectLiveEvent.ts, unless one is tapped
// in the "other games" strip (that choice holds until the game ends). URL
// overrides for testing or pinning a game:
//   /live?event=nba-401909090   always show that event
// Back and Fullscreen sit at the start of the bottom strip and hide while
// fullscreen, whether that came from the button or the browser's F11.

const ESPN_SPORTS = new Set(["nfl", "ncaaf", "nba", "nhl", "mlb"]);
const POLL_MS: Record<string, number> = { f1: 3_000, nhl: 5_000, frc: 60_000 };
const FINALS_WINDOW_MS = 18 * 60 * 60 * 1000;

function SportView({
  event,
  label,
  color,
  frcStreamUrl,
  onSaveFrcStream,
}: {
  event: NormalizedEvent;
  label: string;
  color: string;
  frcStreamUrl?: string;
  onSaveFrcStream: (url: string) => void;
}) {
  const url = ESPN_SPORTS.has(event.sport)
    ? `/api/live/espn/${event.sport}/${event.id}`
    : event.sport === "f1"
      ? "/api/live/f1"
      : event.sport === "frc"
        ? `/api/live/frc/${event.id}`
        : null;
  const { data, error } = useLiveDetail<any>(url, POLL_MS[event.sport] ?? 10_000);
  if (!data) {
    return (
      <LiveFrame league={label} leagueColor={color} live={false} centre={event.name}>
        <Message>{error ?? "Loading live data…"}</Message>
      </LiveFrame>
    );
  }

  switch (data.kind) {
    case "football":
      return <FootballView data={data as FootballState} league={label} leagueColor={color} />;
    case "basketball":
      return <BasketballView data={data as BasketballState} leagueColor={color} />;
    case "hockey":
      return <HockeyView data={data as HockeyState} leagueColor={color} />;
    case "baseball":
      return <BaseballView data={data as BaseballState} leagueColor={color} />;
    case "f1":
      return <F1View data={data as F1State} leagueColor={color} />;
    case "frc":
      return <FrcView data={data as FrcState} eventName={event.name} leagueColor={color} streamUrl={frcStreamUrl} onSaveStream={onSaveFrcStream} />;
    default:
      return (
        <LiveFrame league={label} leagueColor={color} live={false} centre={event.name}>
          <Message>No view for this data</Message>
        </LiveFrame>
      );
  }
}

// True while the display fills the whole screen. Browser F11 fullscreen
// doesn't set document.fullscreenElement, so on mouse-driven devices the
// window covering the full screen counts too. Not on touch devices: an
// installed home-screen app is screen-sized without being "fullscreen", and
// treating it as such would hide the Back button with no way to get it back.
function useIsFullscreen(): boolean {
  const check = () =>
    Boolean(document.fullscreenElement) ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.matchMedia("(pointer: fine)").matches && window.innerHeight >= screen.height - 1 && window.innerWidth >= screen.width - 1);
  const [full, setFull] = useState(check);
  useEffect(() => {
    const update = () => setFull(check());
    window.addEventListener("resize", update);
    document.addEventListener("fullscreenchange", update);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("fullscreenchange", update);
    };
  }, []);
  return full;
}

const followedFirst = (a: NormalizedEvent, b: NormalizedEvent) =>
  Number(Boolean(b.followed || b.manuallyFollowed)) - Number(Boolean(a.followed || a.manuallyFollowed));

// `onBack` is set when the display is opened as a tab inside the dashboard;
// the standalone /live page has no way back by design.
export default function LiveScreen({ onBack }: { onBack?: () => void } = {}) {
  const { settings, save } = useSettings();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const pinned = params.get("event");

  const { events, allEvents } = useEvents(
    settings.disabledCoreSources,
    settings.excludedLeagues,
    settings.frcRegions,
    settings.favoriteTeams,
    settings.followedEventIds,
    settings.snoozedEventIds,
    settings.notifyLeadMinutes,
    30_000
  );

  // A game tapped in the strip overrides the automatic pick for as long as
  // it stays live; once it ends, selection goes back to selectLiveEvent.
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const liveEvents = useMemo(() => events.filter((e) => e.status === "live" && LIVE_VIEW_SPORTS.has(e.sport)), [events]);
  const chosen = chosenKey ? liveEvents.find((e) => eventKey(e) === chosenKey) : undefined;
  useEffect(() => {
    if (chosenKey && !chosen && events.length > 0) setChosenKey(null);
  }, [chosenKey, chosen, events.length]);

  // A pinned event is looked up before league/region filters, so a
  // hand-picked game shows even from a league hidden on the dashboard.
  const selected = useMemo(
    () => (pinned ? allEvents.find((e) => eventKey(e) === pinned) : undefined) ?? chosen ?? selectLiveEvent(events, currentKey),
    [events, allEvents, currentKey, pinned, chosen]
  );
  useEffect(() => {
    setCurrentKey(selected ? eventKey(selected) : null);
  }, [selected]);

  const others = useMemo(
    () =>
      liveEvents
        .filter((e) => !selected || eventKey(e) !== eventKey(selected))
        .sort((a, b) => followedFirst(a, b) || a.startTime.localeCompare(b.startTime)),
    [liveEvents, selected]
  );

  const metaFor = useCallback(
    (e: NormalizedEvent) => sportMeta(e, settings.esportsCatalog, settings.sportColorOverrides),
    [settings.esportsCatalog, settings.sportColorOverrides]
  );

  // ----- display chrome: keep awake, hide the cursor, hide buttons when fullscreen -----
  const fullscreen = useIsFullscreen();
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poke = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 4000);
  }, []);

  useEffect(() => {
    document.body.classList.add("live-body");
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const requestLock = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    requestLock();
    // A wake lock is dropped whenever the tab is hidden; take it back on return.
    const onVisible = () => document.visibilityState === "visible" && requestLock();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.body.classList.remove("live-body");
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => undefined);
    };
  }, []);

  const stream = useMemo(
    () => (selected && ESPORTS_SPORTS.has(selected.sport) ? embeddableStream((selected.streams ?? []).map((s) => s.url).concat(selected.streamUrl ?? [])) : null),
    [selected]
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onBack && !document.fullscreenElement) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  // FRC webcasts aren't in TBA's data the app reads, so a stream link is
  // pasted in per event and kept in settings.
  const saveFrcStream = (eventId: string, url: string) => {
    const next = { ...settings.frcStreamUrls };
    if (url) next[eventId] = url;
    else delete next[eventId];
    save({ frcStreamUrls: next });
  };

  // ----- render -----
  let body: ReactNode;
  if (!selected) {
    const now = Date.now();
    const upcoming = events
      .filter((e) => e.status === "upcoming" && LIVE_VIEW_SPORTS.has(e.sport))
      .sort((a, b) => followedFirst(a, b) || a.startTime.localeCompare(b.startTime))
      .slice(0, 5);
    const finished = events
      .filter((e) => e.status === "finished" && LIVE_VIEW_SPORTS.has(e.sport) && e.seriesScore && now - new Date(e.startTime).getTime() < FINALS_WINDOW_MS)
      .sort((a, b) => followedFirst(a, b) || b.startTime.localeCompare(a.startTime))
      .slice(0, 6);
    body = <IdleView upcoming={upcoming} finished={finished} timezone={settings.timezone} metaFor={metaFor} />;
  } else {
    const meta = metaFor(selected);
    const sel = selected;
    body = ESPORTS_SPORTS.has(sel.sport) ? (
      <EsportsView event={sel} label={meta.label} leagueColor={meta.color} stream={stream} />
    ) : (
      <SportView
        key={eventKey(sel)}
        event={sel}
        label={meta.label}
        color={meta.color}
        frcStreamUrl={sel.sport === "frc" ? settings.frcStreamUrls?.[sel.id] : undefined}
        onSaveFrcStream={(url) => saveFrcStream(sel.id, url)}
      />
    );
  }

  return (
    <div className={`live-root${controlsVisible ? "" : " live-idle"}`} onPointerMove={poke} onPointerDown={poke}>
      <div className="live-view">{body}</div>
      {/* Bottom strip: Back/Fullscreen first, then the other live games. The
          buttons sit in the strip's flow (not floating over it) so they can
          never cover a game, and the whole row hides while fullscreen. */}
      {(others.length > 0 || !fullscreen) && (
        <nav className="lv-others" aria-label="Other live games">
          {!fullscreen && (
            <span className="lv-strip-controls">
              {onBack && (
                <button className="lv-strip-btn" onClick={onBack}>
                  ‹ Back
                </button>
              )}
              <button className="lv-strip-btn" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}>
                Fullscreen
              </button>
            </span>
          )}
          {others.map((e) => (
            <button key={eventKey(e)} onClick={() => !pinned && setChosenKey(eventKey(e))} title="Show this game">
              <span className="bar" style={{ background: metaFor(e).color }} />
              <span className="name">
                {e.followed || e.manuallyFollowed ? "★ " : ""}
                {e.name}
              </span>
              <span className="detail">{[e.seriesScore, e.liveDetail].filter(Boolean).join(" · ") || metaFor(e).label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
