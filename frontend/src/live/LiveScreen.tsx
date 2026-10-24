import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "../SettingsContext";
import { useEvents } from "../useEvents";
import { sportMeta } from "../sportMeta";
import type { NormalizedEvent } from "../types";
import { isLiveNow } from "../eventStatus";
import { loadQuiet, saveQuiet, useQuietHours, type QuietHours } from "../quietHours";
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
import GameTile from "./GameTile";
import {
  dropOnSlot,
  hideGame,
  interest,
  loadLayout,
  loadPrefs,
  multiTemplate,
  placeGames,
  pruneTo,
  saveLayout,
  savePrefs,
  tapToBig,
  unpinGame,
  type LiveLayout,
  type LayoutChoice,
  autoLayout,
  type MultiPrefs,
} from "./multiGame";
import "./live.css";

// Full-screen display at /live, meant for a dedicated tablet or monitor.
// With two or more games live it shows several at once (multiGame.ts), in
// the RedZone or grid arrangement picked with the layout switch; "Single"
// is one game at a time, chosen by selectLiveEvent.ts unless one is tapped
// in the "other games" strip (that choice holds until the game ends). URL
// override for testing or pinning a game (always single):
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
  muted = true,
}: {
  event: NormalizedEvent;
  label: string;
  color: string;
  frcStreamUrl?: string;
  onSaveFrcStream: (url: string) => void;
  muted?: boolean;
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
      return <FrcView data={data as FrcState} eventName={event.name} leagueColor={color} streamUrl={frcStreamUrl} onSaveStream={onSaveFrcStream} muted={muted} />;
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
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => (h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

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

function useIsPortrait(): boolean {
  const query = "(max-aspect-ratio: 1/1)";
  const [portrait, setPortrait] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const update = () => setPortrait(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return portrait;
}

const LAYOUTS: [LayoutChoice, string][] = [
  ["auto", "Auto"],
  ["redzone", "RedZone"],
  ["grid", "Grid"],
  ["single", "Single"],
];

// A press that turns into a drag: the mouse after a small move, touch after
// holding still briefly (so the strip still scrolls under a finger).
interface Press {
  key: string;
  from: number | "strip";
  x0: number;
  y0: number;
  touch: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
type DropTarget = number | "strip" | null;

function dropTargetAt(x: number, y: number): DropTarget {
  const el = document.elementFromPoint(x, y);
  const tile = el?.closest<HTMLElement>("[data-slot]");
  if (tile) return Number(tile.dataset.slot);
  return el?.closest(".lv-others") ? "strip" : null;
}

// The strip is a sideways row, so turn a mouse wheel's up/down into left/right
// (a trackpad's own sideways swipe passes straight through).
function wheelScrollsSideways(el: HTMLElement | null) {
  if (!el) return;
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  };
  el.addEventListener("wheel", onWheel, { passive: false });
  return () => el.removeEventListener("wheel", onWheel);
}

const followedFirst =(a: NormalizedEvent, b: NormalizedEvent) =>
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
  // Same idea of "live" as the dashboard's LIVE badge, so a game shown live
  // there is never missing here.
  const liveEvents = useMemo(() => {
    const now = new Date();
    return events.filter((e) => isLiveNow(e, now) && LIVE_VIEW_SPORTS.has(e.sport));
  }, [events]);
  const chosen = chosenKey ? liveEvents.find((e) => eventKey(e) === chosenKey) : undefined;
  useEffect(() => {
    if (chosenKey && !chosen && events.length > 0) setChosenKey(null);
  }, [chosenKey, chosen, events.length]);

  // A pinned event is looked up before league/region filters, so a
  // hand-picked game shows even from a league hidden on the dashboard.
  const selected = useMemo(
    () => (pinned ? allEvents.find((e) => eventKey(e) === pinned) : undefined) ?? chosen ?? selectLiveEvent(events, currentKey, settings.eventRanking),
    [events, allEvents, currentKey, pinned, chosen, settings.eventRanking]
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

  // ----- several games at once -----
  const [savedLayout, setLayoutState] = useState<LayoutChoice>(loadLayout);
  // Quiet hours (the user works nights and sleeps through the morning):
  // nothing makes a sound on its own; the layout is unchanged.
  const [quietHours, setQuietHoursState] = useState<QuietHours>(loadQuiet);
  const setQuietHours = (q: QuietHours) => {
    setQuietHoursState(q);
    saveQuiet(q);
  };
  const [quietOpen, setQuietOpen] = useState(false);
  const quiet = useQuietHours(quietHours, settings.timezone);
  const autoPick = useMemo(() => autoLayout(liveEvents, settings.eventRanking), [liveEvents, settings.eventRanking]);
  const layout: LiveLayout = savedLayout === "auto" ? autoPick : savedLayout;
  const setLayout = (l: LayoutChoice) => {
    setLayoutState(l);
    saveLayout(l);
  };
  const [prefs, setPrefsState] = useState<MultiPrefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const setPrefs = useCallback((p: MultiPrefs) => {
    setPrefsState(p);
    savePrefs(p);
  }, []);
  const multi = !pinned && layout !== "single" && liveEvents.length >= 2;

  // pins and hidden games are dropped once their game is no longer live
  useEffect(() => {
    if (events.length === 0) return;
    const live = new Set(liveEvents.map(eventKey));
    const next = pruneTo(prefs, live);
    if (
      Object.keys(next.pins).length !== Object.keys(prefs.pins).length ||
      next.hidden.length !== prefs.hidden.length ||
      (next.benched ?? []).length !== (prefs.benched ?? []).length
    )
      setPrefs(next);
  }, [liveEvents, events.length, prefs, setPrefs]);

  // when each game's score last changed (a fresh score makes it interesting)
  const lastScore = useRef<Map<string, { score?: string; at?: number }>>(new Map());
  const [powerPlays, setPowerPlays] = useState<Record<string, boolean>>({});
  const reportPowerPlay = useCallback((key: string, on: boolean) => {
    setPowerPlays((pp) => (Boolean(pp[key]) === on ? pp : { ...pp, [key]: on }));
  }, []);
  const scores = useMemo(() => {
    const now = Date.now();
    const out = new Map<string, number>();
    for (const e of liveEvents) {
      const k = eventKey(e);
      const seen = lastScore.current.get(k);
      if (!seen) lastScore.current.set(k, { score: e.seriesScore });
      else if (seen.score !== e.seriesScore) lastScore.current.set(k, { score: e.seriesScore, at: now });
      out.set(k, interest(e, now, { scoredAt: lastScore.current.get(k)?.at, powerPlay: powerPlays[k] }, settings.eventRanking));
    }
    return out;
  }, [liveEvents, powerPlays, settings.eventRanking]);

  const prevSlots = useRef<string[]>([]);
  const placement = useMemo(() => {
    const r = placeGames(liveEvents, scores, prevSlots.current, prefs, layout, settings.eventRanking);
    prevSlots.current = r.slots;
    return r;
  }, [liveEvents, scores, prefs, layout, settings.eventRanking]);
  const slotsRef = useRef(placement.slots);
  slotsRef.current = placement.slots;
  const byKey = useMemo(() => new Map(liveEvents.map((e) => [eventKey(e), e])), [liveEvents]);
  const portrait = useIsPortrait();

  // ----- dragging games between spots and the strip -----
  const press = useRef<Press | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ key: string; x: number; y: number; over: DropTarget } | null>(null);

  const startPress = (e: React.PointerEvent, key: string, from: number | "strip") => {
    if (!multi || (e.pointerType === "mouse" && e.button !== 0)) return;
    const p: Press = { key, from, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== "mouse", started: false };
    if (p.touch) {
      p.timer = setTimeout(() => {
        p.started = true;
        navigator.vibrate?.(15);
        setDrag({ key, x: p.x0, y: p.y0, over: dropTargetAt(p.x0, p.y0) });
      }, 350);
    }
    press.current = p;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
      if (!p.started) {
        if (p.touch) {
          if (moved > 10) {
            clearTimeout(p.timer);
            press.current = null; // a scroll or swipe, not a hold
          }
          return;
        }
        if (moved < 6) return;
        p.started = true;
      }
      e.preventDefault();
      setDrag({ key: p.key, x: e.clientX, y: e.clientY, over: dropTargetAt(e.clientX, e.clientY) });
    };
    const end = (e: PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (!p.started) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      setDrag(null);
      if (e.type === "pointercancel") return;
      const over = dropTargetAt(e.clientX, e.clientY);
      if (typeof over === "number") setPrefs(dropOnSlot(prefsRef.current, p.key, over, slotsRef.current));
      else if (over === "strip" && p.from !== "strip") setPrefs(hideGame(prefsRef.current, p.key));
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [setPrefs]);

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
    // the one game on screen has sound — never during quiet hours
    () => (selected && ESPORTS_SPORTS.has(selected.sport) ? embeddableStream((selected.streams ?? []).map((s) => s.url).concat(selected.streamUrl ?? []), quiet) : null),
    [selected, quiet]
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
  if (multi) {
    const shown = placement.slots.map((k) => byKey.get(k)).filter((e): e is NormalizedEvent => Boolean(e));
    const tpl = multiTemplate(layout, shown.length, portrait);
    body = (
      <div className={`lv-multi ${tpl.className}`} style={{ gridTemplateAreas: tpl.areas, gridTemplateColumns: tpl.columns }}>
        {shown.map((e, i) => {
          const k = eventKey(e);
          return (
            <GameTile
              key={k}
              event={e}
              slot={i}
              big={(layout === "redzone" && i === 0 && !portrait) || shown.length === 1}
              withSound={!quiet && layout === "redzone" && i === 0}
              pinned={prefs.pins[k] !== undefined}
              dropping={drag !== null && drag.over === i && drag.key !== k}
              lifted={drag?.key === k}
              frcStreamUrl={e.sport === "frc" ? settings.frcStreamUrls?.[e.id] : undefined}
              onUnpin={() => setPrefs(unpinGame(prefs, k))}
              onPowerPlay={(on) => reportPowerPlay(k, on)}
              onPointerDown={(ev) => startPress(ev, k, i)}
            />
          );
        })}
      </div>
    );
  } else if (!selected) {
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
        muted={quiet}
        onSaveFrcStream={(url) => saveFrcStream(sel.id, url)}
      />
    );
  }

  // Anything placed by hand — pinned spots, games hidden or swapped out, a
  // game picked in Single — is undone in one tap, back to automatic picking.
  const manual = Object.keys(prefs.pins).length > 0 || prefs.hidden.length > 0 || (prefs.benched?.length ?? 0) > 0 || chosenKey !== null;
  const backToAuto = () => {
    setPrefs({ pins: {}, hidden: [] });
    setChosenKey(null);
  };

  const stripGames = multi ? placement.strip.map((k) => byKey.get(k)).filter((e): e is NormalizedEvent => Boolean(e)) : others;
  const hidden = new Set(prefs.hidden);
  const tapStrip = (key: string) => {
    if (suppressClick.current || pinned) return;
    if (multi) setPrefs(tapToBig(prefs, key));
    else setChosenKey(key);
  };

  return (
    <div className={`live-root${controlsVisible ? "" : " live-idle"}${drag ? " lv-dragging" : ""}`} onPointerMove={poke} onPointerDown={poke}>
      <div className="live-view">{body}</div>
      {/* Bottom strip: Back/Fullscreen first, then the other live games. The
          buttons sit in the strip's flow (not floating over it) so they can
          never cover a game, and the whole row hides while fullscreen. */}
      {(stripGames.length > 0 || !fullscreen || (manual && !pinned)) && (
        <nav ref={wheelScrollsSideways} className={`lv-others${drag && drag.over === "strip" ? " drop" : ""}`} aria-label="Other live games">
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
              {!pinned && (
                <span className="lv-layout-switch" role="group" aria-label="Layout">
                  {LAYOUTS.map(([value, label]) => (
                    <button key={value} className="lv-strip-btn" aria-pressed={savedLayout === value} onClick={() => setLayout(value)}>
                      {value === "auto" && savedLayout === "auto" ? `Auto · ${LAYOUTS.find(([v]) => v === autoPick)?.[1]}` : label}
                    </button>
                  ))}
                </span>
              )}
              {!pinned && (
                <span className="lv-quiet-wrap">
                  <button className="lv-strip-btn" aria-pressed={quiet} aria-expanded={quietOpen} onClick={() => setQuietOpen(!quietOpen)} title="Quiet hours on this screen: every stream starts muted">
                    {quietHours.on ? `Quiet ${hourLabel(quietHours.start)}–${hourLabel(quietHours.end)}` : "Quiet off"}
                  </button>
                  {quietOpen && (
                    <span className="lv-quiet-pop" role="group" aria-label="Quiet hours on this screen">
                      <button className="lv-strip-btn" aria-pressed={quietHours.on} onClick={() => setQuietHours({ ...quietHours, on: !quietHours.on })}>
                        {quietHours.on ? "On" : "Off"}
                      </button>
                      <select aria-label="Quiet from" value={quietHours.start} onChange={(e) => setQuietHours({ ...quietHours, start: Number(e.target.value) })}>
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {hourLabel(h)}
                          </option>
                        ))}
                      </select>
                      to
                      <select aria-label="Quiet until" value={quietHours.end} onChange={(e) => setQuietHours({ ...quietHours, end: Number(e.target.value) })}>
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {hourLabel(h)}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                </span>
              )}
            </span>
          )}
          {manual && !pinned && (
            <button className="lv-strip-btn lv-auto-btn" onClick={backToAuto} title="Unpin everything and let the display pick">
              ↺ Unpin all
            </button>
          )}
          {stripGames.map((e) => (
            <button
              key={eventKey(e)}
              className={[hidden.has(eventKey(e)) && "is-hidden", drag?.key === eventKey(e) && "is-lifted"].filter(Boolean).join(" ") || undefined}
              onClick={() => tapStrip(eventKey(e))}
              onPointerDown={(ev) => startPress(ev, eventKey(e), "strip")}
              title="Show this game"
            >
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
      {drag && (
        <div className="lv-drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <span className="bar" style={{ background: byKey.get(drag.key) ? metaFor(byKey.get(drag.key)!).color : undefined }} />
          {byKey.get(drag.key)?.name}
        </div>
      )}
    </div>
  );
}
