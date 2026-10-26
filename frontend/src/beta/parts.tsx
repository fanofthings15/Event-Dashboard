import { useState } from "react";
import type { NormalizedEvent, EventTeam } from "../types";

// Building blocks shared by the desktop and phone layouts of the redesign.

export const eventKey = (e: NormalizedEvent) => `${e.sport}-${e.id}`;
export const isMine = (e: NormalizedEvent) => Boolean(e.followed || e.manuallyFollowed);

// Scores per side from seriesScore: ESPN sends "away-home" ("132-123"),
// esports "1-0 (Bo3)"; "Best of 3" or no score yet gives none.
export function sideScores(e: NormalizedEvent): [string, string] | null {
  const m = e.seriesScore?.match(/^(\d+)-(\d+)/);
  return m ? [m[1], m[2]] : null;
}

// What's left of an esports series score once the map count is split out
// ("Bo3"), or the whole thing when there's no score yet ("Best of 3").
export function seriesNote(e: NormalizedEvent): string | undefined {
  if (!e.seriesScore) return undefined;
  const bo = e.seriesScore.match(/\((Bo\d+)\)/);
  if (bo) return bo[1];
  return sideScores(e) ? undefined : e.seriesScore;
}

// Short names as the sources write them in the event name ("Lakers @ Jazz",
// "T1 vs Gen.G"); the team list has the long ones ("Los Angeles Lakers").
export function shortNames(e: NormalizedEvent): [string, string] | null {
  const parts = e.name.split(/ @ | vs\.? /);
  if (parts.length === 2) return [parts[0].trim(), parts[1].trim()];
  if (e.teams?.length === 2) return [e.teams[0].name, e.teams[1].name];
  return null;
}

export function TeamLogo({ team, size = 28, fallbackColor }: { team?: EventTeam; size?: number; fallbackColor: string }) {
  const [broken, setBroken] = useState(false);
  const initials = (team?.name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  if (team?.imageUrl && !broken) {
    return <img className="b-logo" src={team.imageUrl} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} style={{ width: size, height: size }} />;
  }
  return (
    <span className="b-logo b-logo-fallback" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.max(8, size * 0.32), background: `${fallbackColor}33`, borderColor: `${fallbackColor}66` }}>
      {initials}
    </span>
  );
}

// The game clock when the source sends one ("Q3 8:42"); esports don't.
export function liveStatus(e: NormalizedEvent): string {
  return e.liveDetail || "Live";
}

// "NHL", "Counter-Strike 2 · PGL Masters · Bo3": source, league when it says
// something new, and the series format.
export function subLine(e: NormalizedEvent, label: string): string {
  const parts = [label];
  if (e.league && e.league.toLowerCase() !== label.toLowerCase()) parts.push(e.league);
  const note = seriesNote(e);
  if (note) parts.push(note.replace(/^Best of (\d+)$/, "Bo$1"));
  return parts.join(" · ");
}

// Day key in the user's timezone, for grouping ("2026-10-26").
export function dayKey(iso: string | Date, timezone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(timezone ? { timeZone: timezone } : {}) }).format(d);
}

export function dayLabel(key: string, now: Date, timezone: string): string {
  const today = dayKey(now, timezone);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000), timezone);
  const date = new Date(`${key}T12:00:00`);
  const text = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (key === today) return `Today · ${text}`;
  if (key === tomorrow) return `Tomorrow · ${text}`;
  return text;
}

// Big card for one of the user's own games that's live.
export function LiveCard({ e, color, label, onOpen }: { e: NormalizedEvent; color: string; label: string; onOpen: () => void }) {
  const scores = sideScores(e);
  const names = shortNames(e);
  return (
    <button type="button" className="b-livecard" style={{ ["--c" as string]: color }} onClick={onOpen}>
      <span className="b-livecard-top">
        <span className="b-star">★</span>
        <span className="b-ellipsis">{label} · {e.league}</span>
        <span className="b-live-text">● {liveStatus(e)}{!e.liveDetail && seriesNote(e) ? ` · ${seriesNote(e)}` : ""}</span>
      </span>
      {names ? (
        [0, 1].map((i) => (
          <span key={i} className="b-livecard-team">
            <TeamLogo team={e.teams?.[i]} size={30} fallbackColor={color} />
            <span className="b-ellipsis">{names[i]}</span>
            <span className="b-score">{scores?.[i] ?? ""}</span>
          </span>
        ))
      ) : (
        <span className="b-livecard-team">
          <span className="b-ellipsis">{e.name}</span>
        </span>
      )}
      {e.situation?.downDistance && <span className="b-muted b-small">{e.situation.downDistance}</span>}
    </button>
  );
}

// Compact score tile for the rest of the live games.
export function MiniTile({ e, color, onOpen }: { e: NormalizedEvent; color: string; onOpen: () => void }) {
  const scores = sideScores(e);
  const names = shortNames(e);
  return (
    <button type="button" className="b-mini" onClick={onOpen}>
      {names ? (
        [0, 1].map((i) => (
          <span key={i} className="b-mini-team">
            <TeamLogo team={e.teams?.[i]} size={20} fallbackColor={color} />
            <span className="b-ellipsis">{names[i]}</span>
            <span className="b-score-sm">{scores?.[i] ?? ""}</span>
          </span>
        ))
      ) : (
        <span className="b-mini-team">
          <span className="b-ellipsis">{e.name}</span>
        </span>
      )}
      <span className="b-small"><span className="b-live-text">{liveStatus(e)}</span>{seriesNote(e) && <span className="b-muted"> · {seriesNote(e)}</span>}</span>
    </button>
  );
}

// One line in a list: time or status on the left, colour bar, name, score.
export function EventRow({
  e,
  color,
  left,
  leftLive,
  sub,
  right,
  onOpen,
  logos = true,
}: {
  e: NormalizedEvent;
  color: string;
  left: string;
  leftLive?: boolean;
  sub?: string;
  right?: string;
  onOpen: () => void;
  logos?: boolean;
}) {
  return (
    <button type="button" className="b-row" onClick={onOpen}>
      <span className={`b-row-left${leftLive ? " b-live-text" : ""}`}>{left}</span>
      <span className="b-bar" style={{ background: color }} />
      {logos && e.teams?.length === 2 && (
        <span className="b-row-logos">
          <TeamLogo team={e.teams[0]} size={20} fallbackColor={color} />
          <TeamLogo team={e.teams[1]} size={20} fallbackColor={color} />
        </span>
      )}
      <span className="b-row-main">
        <span className="b-ellipsis b-row-name">
          {isMine(e) && <span className="b-star">★ </span>}
          {e.name}
        </span>
        {sub && <span className="b-ellipsis b-muted b-small">{sub}</span>}
      </span>
      {right && <span className="b-row-right">{right}</span>}
    </button>
  );
}
