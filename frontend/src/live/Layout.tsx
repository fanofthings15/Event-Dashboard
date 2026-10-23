import { useEffect, useRef, useState, type ReactNode } from "react";

// Shared page shell for every /live view. All text lives here in normal
// HTML (grid/flex, ellipsis, wrapping) — the SVGs inside views draw only the
// playing surface and its markers, so nothing positioned by hand can collide
// or spill out of its box at a different screen size or font.

// Colours used inside the SVG surfaces (the HTML side reads the same values
// from CSS variables in live.css). Fixed dark palette: this is a dedicated
// display, not a themed page.
export const C = {
  bg: "#0f1115",
  panel: "#171a21",
  border: "#262b35",
  text: "#e8eaed",
  muted: "#8b92a3",
  accent: "#4f8dfd",
  live: "#ef4444",
  yellow: "#facc15",
  green: "#22c55e",
};

export interface ScoreTeam {
  abbr: string;
  score?: string;
  logo?: string;
  color: string;
  timeouts?: { left: number; of: number };
}

// Timeouts left as a row of bars, used ones dimmed — the TV-graphic way.
export function Timeouts({ left, of, color }: { left: number; of: number; color: string }) {
  return (
    <span className="lv-tos" aria-label={`${left} timeout${left === 1 ? "" : "s"} left`} title={`${left} of ${of} timeouts left`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} style={{ background: i < left ? color : undefined }} />
      ))}
    </span>
  );
}

export function LiveFrame({
  league,
  leagueColor,
  live = true,
  centre,
  status,
  children,
  footer,
  layout = "side",
}: {
  league: string;
  leagueColor?: string;
  live?: boolean;
  centre?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  // "side": surface left, panel right. "stack": surface on top and centred,
  // with a row of details underneath — for wide surfaces (rink, court, field).
  layout?: "side" | "stack";
}) {
  return (
    <div className="lv">
      <header className="lv-head">
        <div className="lv-head-left">
          <span className="lv-chip" style={{ borderColor: leagueColor, background: leagueColor ? `${leagueColor}40` : undefined }}>
            {league}
          </span>
          {live && (
            <span className="lv-live">
              <i />
              LIVE
            </span>
          )}
        </div>
        <div className="lv-head-centre">{centre}</div>
        <div className="lv-head-right">{status}</div>
      </header>
      <main className={`lv-body${layout === "stack" ? " lv-body-stack" : ""}`}>{children}</main>
      {footer && <footer className="lv-foot">{footer}</footer>}
    </div>
  );
}

export function Scoreboard({ away, home, possession }: { away: ScoreTeam; home: ScoreTeam; possession?: "away" | "home" }) {
  const team = (t: ScoreTeam, side: "away" | "home") => (
    <span className={`lv-team lv-team-${side}`}>
      {possession === side && side === "away" && <i className="lv-poss" aria-label="has possession" />}
      {t.logo && <img src={t.logo} alt="" />}
      <span className="lv-team-name">
        <span style={{ color: t.color }}>{t.abbr}</span>
        {t.timeouts && <Timeouts {...t.timeouts} color={t.color} />}
      </span>
      {possession === side && side === "home" && <i className="lv-poss" aria-label="has possession" />}
    </span>
  );
  return (
    <div className="lv-score">
      {team(away, "away")}
      <span className="lv-score-num">
        {away.score ?? ""}
        {away.score !== undefined ? " – " : " vs "}
        {home.score ?? ""}
      </span>
      {team(home, "home")}
    </div>
  );
}

// The playing surface: an SVG scaled to fit whatever space is left, with an
// optional caption row underneath (direction of attack, legend).
export function Surface({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <section className="lv-main">
      <div className="lv-surface">{children}</div>
      {caption && <div className="lv-caption">{caption}</div>}
    </section>
  );
}

// Bottom row of the stacked layout: play-by-play on the left, a compact board
// on the right.
export function Below({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <section className="lv-below">
      <div className="lv-below-left">{left}</div>
      {right}
    </section>
  );
}

// Teams as rows, stats as columns — a few rows tall, so it doesn't eat the
// height a stacked surface needs.
export function StatGrid({ teams, cols }: { teams: { abbr: string; color: string }[]; cols: [string, (string | undefined)[]][] }) {
  return (
    <table className="lv-grid">
      <thead>
        <tr>
          <th />
          {cols.map(([label]) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {teams.map((t, i) => (
          <tr key={t.abbr + i}>
            <td style={{ color: t.color }}>{t.abbr}</td>
            {cols.map(([label, vals]) => (
              <td key={label}>{vals[i] ?? "–"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Something to catch from the corner of your eye: when a team's score goes
// up, the whole screen edge flashes in that team's colour, with a banner for
// the big moments. `describe` turns a score jump into the banner text (or
// null for an edge-only flash, e.g. ordinary baskets) and how long it shows.
export function useScoreFlash(
  scores: [number, number] | undefined,
  teams: { abbr: string; color: string }[],
  describe: (delta: number, team: string) => { banner: string | null; ms: number }
): ReactNode {
  const prev = useRef<{ key: string; scores: [number, number] } | null>(null);
  const [flash, setFlash] = useState<{ id: number; color: string; banner: string | null; ms: number } | null>(null);
  const key = teams.map((t) => t.abbr).join("|");

  useEffect(() => {
    if (!scores || scores.some((s) => Number.isNaN(s))) return;
    const before = prev.current;
    prev.current = { key, scores };
    if (!before || before.key !== key) return; // first reading of this game: nothing to compare
    const i: 0 | 1 | null = scores[0] > before.scores[0] ? 0 : scores[1] > before.scores[1] ? 1 : null;
    if (i === null || !teams[i]) return;
    const d = describe(scores[i] - before.scores[i], teams[i].abbr);
    setFlash({ id: Date.now(), color: teams[i].color, banner: d.banner, ms: d.ms });
    // describe/teams are read only at the moment of a change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scores?.[0], scores?.[1]]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.ms);
    return () => clearTimeout(t);
  }, [flash]);

  if (!flash) return null;
  return (
    <div key={flash.id} className="lv-flash" style={{ ["--flash" as string]: flash.color }} aria-live="assertive">
      {flash.banner && <div className="lv-flash-banner">{flash.banner}</div>}
    </div>
  );
}

export function Side({ children }: { children: ReactNode }) {
  return <aside className="lv-side">{children}</aside>;
}

export function SideLabel({ children }: { children: ReactNode }) {
  return <div className="lv-label">{children}</div>;
}

export function StatTable({ teams, rows }: { teams: { abbr: string; color: string }[]; rows: [string, string | undefined, string | undefined][] }) {
  return (
    <table className="lv-stats">
      <thead>
        <tr>
          <th />
          {teams.map((t) => (
            <th key={t.abbr} style={{ color: t.color }}>
              {t.abbr}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, a, b]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{a ?? "–"}</td>
            <td>{b ?? "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Line({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return <div className={`lv-line${primary ? " lv-line-primary" : ""}`}>{children}</div>;
}

export function Source({ children }: { children: ReactNode }) {
  return <div className="lv-source">{children}</div>;
}

export function Message({ children }: { children: ReactNode }) {
  return <div className="lv-message">{children}</div>;
}
