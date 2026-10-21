import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "../SettingsContext";
import { useEvents } from "../useEvents";
import { sportMeta } from "../sportMeta";
import type { NormalizedEvent } from "../types";
import type { CropRect } from "../settingsTypes";
import { eventKey, LIVE_VIEW_SPORTS, selectLiveEvent } from "./selectLiveEvent";
import { useLiveDetail } from "./useLiveDetail";
import { cropFor, cropKey, DEFAULT_CROPS, SERIES_SPORTS } from "./cropPresets";
import { embeddableStream } from "./StreamCrop";
import CropCalibrator from "./CropCalibrator";
import type { BaseballState, BasketballState, F1State, FootballState, FrcState, HockeyState } from "./liveTypes";
import FootballView from "./views/FootballView";
import BasketballView from "./views/BasketballView";
import HockeyView from "./views/HockeyView";
import BaseballView from "./views/BaseballView";
import F1View from "./views/F1View";
import FrcView from "./views/FrcView";
import EsportsView from "./views/EsportsView";
import IdleView from "./views/IdleView";
import { C, Header, Screen } from "./Screen";
import "./live.css";

// Full-screen display at /live, meant for a dedicated tablet or monitor.
// Which game it shows is decided by selectLiveEvent.ts. Two URL overrides
// for testing or pinning a game:
//   /live?event=nba-401909090   always show that event
//   /live?calibrate             open the stream-crop editor straight away

const ESPN_SPORTS = new Set(["nfl", "ncaaf", "nba", "nhl", "mlb"]);
const POLL_MS: Record<string, number> = { f1: 3_000, frc: 60_000 };

function Loading({ label, color, error }: { label: string; color: string; error?: string | null }) {
  return (
    <Screen label={`${label} loading`}>
      <Header league={label} leagueColor={color} />
      <text x={400} y={260} fontSize={16} fill={C.muted} textAnchor="middle">
        {error ?? "Loading live data…"}
      </text>
    </Screen>
  );
}

function SportView({ event, label, color }: { event: NormalizedEvent; label: string; color: string }) {
  const url = ESPN_SPORTS.has(event.sport)
    ? `/api/live/espn/${event.sport}/${event.id}`
    : event.sport === "f1"
      ? "/api/live/f1"
      : event.sport === "frc"
        ? `/api/live/frc/${event.id}`
        : null;
  const { data, error } = useLiveDetail<any>(url, POLL_MS[event.sport] ?? 10_000);
  if (!data) return <Loading label={label} color={color} error={error} />;

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
      return <FrcView data={data as FrcState} eventName={event.name} leagueColor={color} />;
    default:
      return <Loading label={label} color={color} error="No view for this data" />;
  }
}

export default function LiveScreen() {
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

  const [currentKey, setCurrentKey] = useState<string | null>(null);
  // A pinned event is looked up before league/region filters, so a
  // hand-picked game shows even from a league hidden on the dashboard.
  const selected = useMemo(
    () => (pinned ? allEvents.find((e) => eventKey(e) === pinned) ?? null : selectLiveEvent(events, currentKey)),
    [events, allEvents, currentKey, pinned]
  );
  useEffect(() => {
    setCurrentKey(selected ? eventKey(selected) : null);
  }, [selected]);

  const metaFor = useCallback(
    (e: NormalizedEvent) => sportMeta(e, settings.esportsCatalog, settings.sportColorOverrides),
    [settings.esportsCatalog, settings.sportColorOverrides]
  );

  // ----- display chrome: fullscreen, keep awake, hide the cursor -----
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

  // ----- stream crop -----
  const esportsCrop = selected && DEFAULT_CROPS[selected.sport] ? selected : null;
  const stream = useMemo(
    () => (selected && (DEFAULT_CROPS[selected.sport] || SERIES_SPORTS.has(selected.sport)) ? embeddableStream((selected.streams ?? []).map((s) => s.url).concat(selected.streamUrl ?? [])) : null),
    [selected]
  );
  const [calibrating, setCalibrating] = useState(params.has("calibrate"));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C") setCalibrating((v) => !v);
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveCrop = (rect: CropRect, scope: "league" | "sport") => {
    if (!esportsCrop) return;
    const key = scope === "league" ? cropKey(esportsCrop.sport, esportsCrop.league) : esportsCrop.sport;
    save({ liveCropPresets: { ...settings.liveCropPresets, [key]: rect } });
    setCalibrating(false);
  };
  const resetCrop = () => {
    if (!esportsCrop) return;
    const next = { ...settings.liveCropPresets };
    delete next[cropKey(esportsCrop.sport, esportsCrop.league)];
    delete next[esportsCrop.sport];
    save({ liveCropPresets: next });
    setCalibrating(false);
  };

  // ----- render -----
  let body: ReactNode;
  if (!selected) {
    const soon = events
      .filter((e) => e.status === "upcoming" && LIVE_VIEW_SPORTS.has(e.sport))
      .sort((a, b) => Number(Boolean(b.followed || b.manuallyFollowed)) - Number(Boolean(a.followed || a.manuallyFollowed)) || a.startTime.localeCompare(b.startTime))
      .slice(0, 4);
    body = <IdleView upcoming={soon} timezone={settings.timezone} metaFor={metaFor} />;
  } else {
    const meta = metaFor(selected);
    body =
      DEFAULT_CROPS[selected.sport] || SERIES_SPORTS.has(selected.sport) ? (
        <EsportsView
          event={selected}
          label={meta.label}
          leagueColor={meta.color}
          mode={DEFAULT_CROPS[selected.sport] ? "crop" : "series"}
          stream={stream}
          crop={cropFor(settings.liveCropPresets, selected.sport, selected.league)}
        />
      ) : (
        <SportView key={eventKey(selected)} event={selected} label={meta.label} color={meta.color} />
      );
  }

  return (
    <div className={`live-root${controlsVisible ? "" : " live-idle"}`} onPointerMove={poke} onPointerDown={poke}>
      <div className="live-stage">{body}</div>
      {controlsVisible && !calibrating && (
        <div className="live-controls">
          <button onClick={toggleFullscreen}>Fullscreen</button>
          {esportsCrop && stream && <button onClick={() => setCalibrating(true)}>Adjust minimap crop</button>}
        </div>
      )}
      {calibrating && esportsCrop && stream && (
        <CropCalibrator
          embed={stream.embed}
          initial={cropFor(settings.liveCropPresets, esportsCrop.sport, esportsCrop.league) ?? DEFAULT_CROPS[esportsCrop.sport]}
          leagueLabel={esportsCrop.league}
          sportLabel={metaFor(esportsCrop).label}
          onSave={saveCrop}
          onReset={resetCrop}
          onClose={() => setCalibrating(false)}
        />
      )}
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  else document.documentElement.requestFullscreen?.().catch(() => undefined);
}
