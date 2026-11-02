import { useEffect, useRef, useState, type ReactNode } from "react";
import type { NormalizedEvent } from "../types";
import { useLiveDetail } from "./useLiveDetail";
import { teamColors, teamLabel } from "./teamColors";
import { C, ESPORTS_TEAM_COLORS, Timeouts } from "./Layout";
import Stream, { embeddableStream } from "./Stream";
import { ESPORTS_SPORTS } from "./selectLiveEvent";
import type { BaseballState, BasketballState, CsState, F1State, FootballState, FrcState, HockeyState, LiveTeam } from "./liveTypes";
import { FootballSurface, PlayKind, timeoutsOf } from "./views/FootballView";
import { HockeySurface } from "./views/HockeyView";
import { BasketballSurface } from "./views/BasketballView";
import { BaseballSurface } from "./views/BaseballView";
import { F1Track, f1Alert } from "./views/F1View";
import { csMapsLine, csUrl } from "./views/EsportsView";

// Twitch won't autoplay a player under 400×300. A Twitch tile drops its
// score line and status line (the broadcast has its own scoreboard) only
// when that's what gets the player over the minimum: a big enough tile keeps
// them, and one too small either way keeps them too, since dropping them
// wouldn't make it autoplay. Decided from the tile's size alone (the lines'
// height is measured while they show), so it can't flip back and forth.
function useBareTwitch(tile: React.RefObject<HTMLDivElement | null>, twitch: boolean): boolean {
  const [bare, setBare] = useState(false);
  const chrome = useRef<number | null>(null);
  useEffect(() => {
    const el = tile.current;
    if (!twitch || !el) {
      setBare(false);
      return;
    }
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const score = el.querySelector<HTMLElement>(".lv-tile-score");
      const status = el.querySelector<HTMLElement>(".lv-tile-status");
      if (score && status) chrome.current = score.offsetHeight + status.offsetHeight + 2 * parseFloat(cs.rowGap || "0");
      const lines = chrome.current ?? 3.6 * parseFloat(cs.fontSize);
      // the player with the lines: a 16:9 box in what's left under them
      const fw = Math.min(w, ((h - lines) * 16) / 9);
      const withLines = fw >= 400 && (fw * 9) / 16 >= 300;
      // without them the player fills the tile (it letterboxes the video)
      setBare(!withLines && w >= 400 && h >= 300);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tile, twitch]);
  return bare;
}

// One game in the multi-game display: score row, the same playing surface
// as its full view, and one line of what's happening. Polls its own live
// data at the sport's usual rate.

const ESPN_SPORTS = new Set(["nfl", "ncaaf", "nba", "nhl", "mlb"]);
const POLL_MS: Record<string, number> = { f1: 3_000, nhl: 5_000, frc: 60_000, cs2: 30_000 };

type Detail = FootballState | BasketballState | HockeyState | BaseballState | F1State | FrcState | CsState;

function detailUrl(e: NormalizedEvent): string | null {
  if (ESPN_SPORTS.has(e.sport)) return `/api/live/espn/${e.sport}/${e.id}`;
  if (e.sport === "f1") return "/api/live/f1";
  if (e.sport === "frc") return `/api/live/frc/${e.id}`;
  if (e.sport === "cs2") return csUrl(e);
  return null;
}

// Edge glow in the scoring team's colour for a while after a score.
function useScoreGlow(scores: [number, number] | undefined, colors: [string, string]): string | null {
  const prev = useRef<[number, number] | null>(null);
  const [glow, setGlow] = useState<string | null>(null);
  useEffect(() => {
    if (!scores || scores.some(Number.isNaN)) return;
    const before = prev.current;
    prev.current = scores;
    if (!before) return;
    const i = scores[0] > before[0] ? 0 : scores[1] > before[1] ? 1 : null;
    if (i === null) return;
    setGlow(colors[i]);
    const t = setTimeout(() => setGlow(null), 12_000);
    return () => clearTimeout(t);
    // colours are read only at the moment of a change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores?.[0], scores?.[1]]);
  return glow;
}

interface Row {
  away: { name: string; color: string; score?: string; timeouts?: { left: number; of: number } };
  home: { name: string; color: string; score?: string; timeouts?: { left: number; of: number } };
  clock?: string;
  tags: { text: string; bg: string; ink: string }[];
  surface: ReactNode;
  status: ReactNode;
}

function teamRow(teams: LiveTeam[]): Pick<Row, "away" | "home"> {
  const [away, home] = teams;
  const [ac, hc] = teamColors(away, home);
  return {
    away: { name: teamLabel(away), color: ac, score: away?.score },
    home: { name: teamLabel(home), color: hc, score: home?.score },
  };
}

function rowFor(event: NormalizedEvent, data: Detail | null, stream: { embed: string } | null, frcStream?: { embed: string } | null): Row | null {
  if (ESPORTS_SPORTS.has(event.sport)) {
    const t = event.teams ?? [];
    const w = event.seriesScore?.match(/(\d+)-(\d+)/);
    return {
      away: { name: t[0]?.name ?? "TBD", color: ESPORTS_TEAM_COLORS[0], score: w?.[1] },
      home: { name: t[1]?.name ?? "TBD", color: ESPORTS_TEAM_COLORS[1], score: w?.[2] },
      clock: event.seriesScore?.match(/\((Bo\d+)\)/)?.[1],
      tags: [],
      surface: stream ? <Stream embed={stream.embed} /> : <div className="lv-tile-empty">No stream</div>,
      // the league first, then CS maps when there are any: "IEM · Cache 13–9 · Mirage live"
      status: [event.league, data?.kind === "cs" ? csMapsLine(data.maps) : null].filter(Boolean).join(" · "),
    };
  }
  if (!data) return null;
  switch (data.kind) {
    case "cs":
      return null; // CS is drawn by the esports branch above
    case "football": {
      const redZone = data.redZone ?? event.situation?.redZone;
      const teams = teamRow(data.teams);
      return {
        away: { ...teams.away, timeouts: timeoutsOf(data, 0) },
        home: { ...teams.home, timeouts: timeoutsOf(data, 1) },
        clock: data.detail,
        tags: redZone ? [{ text: "RED ZONE", bg: C.live, ink: "#fff" }] : [],
        surface: <FootballSurface data={data} />,
        status: (
          <>
            {data.downText && (
              <b>
                {data.downText}
                {data.spotText ? ` at ${data.spotText}` : ""}
              </b>
            )}
            {data.downText && data.lastPlay ? " · " : ""}
            <PlayKind data={data} />
            {data.lastPlay}
          </>
        ),
      };
    }
    case "hockey": {
      const pp = data.powerPlayTeamId ? data.teams.find((t) => t.id === data.powerPlayTeamId) : undefined;
      return {
        ...teamRow(data.teams),
        clock: data.detail,
        tags: pp ? [{ text: `PP ${teamLabel(pp)}`, bg: C.yellow, ink: "#1a1600" }] : [],
        surface: <HockeySurface data={data} />,
        status: data.lastGoal ? (
          <>
            <b>Last goal</b> · {data.lastGoal}
          </>
        ) : (
          data.recent[0]
        ),
      };
    }
    case "basketball":
      return { ...teamRow(data.teams), clock: data.detail, tags: [], surface: <BasketballSurface data={data} />, status: data.recent[0] };
    case "baseball":
      return {
        ...teamRow(data.teams),
        clock: data.inning ?? data.detail,
        tags: [],
        surface: <BaseballSurface data={data} />,
        status: (
          <>
            <b>
              {data.balls}-{data.strikes}, {data.outs} out
            </b>
            {data.lastPlay ? ` · ${data.lastPlay}` : ""}
          </>
        ),
      };
    case "f1":
      return {
        away: { name: data.session?.meeting ?? "F1", color: C.text },
        home: { name: "", color: C.text },
        clock: data.lap ? `Lap ${data.lap.current}/${data.lap.total}` : data.session?.name,
        tags: data.yellowSectors.length ? [{ text: `YELLOW S${data.yellowSectors.join(",")}`, bg: C.yellow, ink: "#1a1600" }] : [],
        surface: <F1Track data={data} />,
        status: data.raceControl[0]?.message,
      };
    case "frc": {
      const m = data.onField ?? data.last;
      return {
        away: { name: event.name, color: C.text },
        home: { name: "", color: C.text },
        clock: m?.label,
        tags: [],
        surface: frcStream ? (
          <Stream embed={frcStream.embed} />
        ) : (
          <div className="lv-tile-frc">
            <span style={{ color: "#ef4444" }}>{m?.red.teams.join(" · ") ?? "Red"}</span>
            <b>
              {m?.red.score ?? "–"} – {m?.blue.score ?? "–"}
            </b>
            <span style={{ color: "#3b82f6" }}>{m?.blue.teams.join(" · ") ?? "Blue"}</span>
          </div>
        ),
        status: data.eventName,
      };
    }
  }
}

export default function GameTile({
  event,
  slot,
  big,
  withSound,
  pinned,
  dropping,
  lifted,
  frcStreamUrl,
  onUnpin,
  onPowerPlay,
  onPointerDown,
}: {
  event: NormalizedEvent;
  slot: number;
  big: boolean;
  withSound: boolean;
  pinned: boolean;
  dropping: boolean;
  lifted: boolean;
  frcStreamUrl?: string;
  onUnpin: () => void;
  onPowerPlay: (on: boolean) => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const { data } = useLiveDetail<Detail>(detailUrl(event), POLL_MS[event.sport] ?? 10_000);
  const urls = (event.streams ?? []).map((s) => s.url).concat(event.streamUrl ?? []);
  const stream = ESPORTS_SPORTS.has(event.sport) ? embeddableStream(urls, !withSound) : null;
  const frcStream = frcStreamUrl ? embeddableStream([frcStreamUrl], !withSound) : null;
  const row = rowFor(event, data, stream, frcStream);

  const powerPlay = data?.kind === "hockey" && Boolean(data.powerPlayTeamId);
  useEffect(() => onPowerPlay(powerPlay), [powerPlay, onPowerPlay]);

  const glow = useScoreGlow(
    row?.away.score !== undefined && row?.home.score !== undefined ? [Number(row.away.score), Number(row.home.score)] : undefined,
    [row?.away.color ?? C.accent, row?.home.color ?? C.accent]
  );

  const alert = data?.kind === "f1" ? f1Alert(data) : undefined;
  const tile = useRef<HTMLDivElement>(null);
  const bare = useBareTwitch(tile, stream?.source === "Twitch");

  return (
    <div
      className={`lv-tile${big ? " big" : ""}${bare ? " bare" : ""}${glow ? " glow" : ""}${alert ? ` alert-${alert}` : ""}${dropping ? " drop" : ""}${lifted ? " lifted" : ""}`}
      style={{ gridArea: `s${slot}`, ["--glow" as string]: glow ?? "transparent" }}
      ref={tile}
      data-slot={slot}
      data-key={`${event.sport}-${event.id}`}
      onPointerDown={onPointerDown}
    >
      {bare ? (
        <>
          <div className="lv-tile-surface">{row?.surface}</div>
          {pinned && (
            <button
              className="lv-tile-pin lv-tile-pin-float"
              aria-label="Unpin"
              title="Unpin — let the display pick this spot again"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onUnpin}
            >
              Pinned ✕
            </button>
          )}
        </>
      ) : (
        <>
          <div className="lv-tile-score">
            {row ? (
              <>
                <span style={{ color: row.away.color }}>{row.away.name}</span>
                {row.away.timeouts && <Timeouts {...row.away.timeouts} color={row.away.color} />}
                {row.away.score !== undefined && row.home.score !== undefined && (
                  <span className="n">
                    {row.away.score} – {row.home.score}
                  </span>
                )}
                {row.home.name && <span style={{ color: row.home.color }}>{row.home.name}</span>}
                {row.home.timeouts && <Timeouts {...row.home.timeouts} color={row.home.color} />}
                {row.tags.map((t) => (
                  <span key={t.text} className="lv-tile-tag" style={{ background: t.bg, color: t.ink }}>
                    {t.text}
                  </span>
                ))}
              </>
            ) : (
              <span>{event.name}</span>
            )}
            <span className="clock">{row?.clock ?? event.liveDetail}</span>
            {pinned && (
              <button
                className="lv-tile-pin"
                aria-label="Unpin"
                title="Unpin — let the display pick this spot again"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onUnpin}
              >
                Pinned ✕
              </button>
            )}
          </div>
          <div className="lv-tile-surface">{row ? row.surface : <div className="lv-tile-empty">Loading…</div>}</div>
          <div className="lv-tile-status">{row?.status}</div>
        </>
      )}
    </div>
  );
}
