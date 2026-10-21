import type { ReactNode } from "react";

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
}

export function LiveFrame({
  league,
  leagueColor,
  live = true,
  centre,
  status,
  children,
  footer,
}: {
  league: string;
  leagueColor?: string;
  live?: boolean;
  centre?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
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
      <main className="lv-body">{children}</main>
      {footer && <footer className="lv-foot">{footer}</footer>}
    </div>
  );
}

export function Scoreboard({ away, home, possession }: { away: ScoreTeam; home: ScoreTeam; possession?: "away" | "home" }) {
  const team = (t: ScoreTeam, side: "away" | "home") => (
    <span className={`lv-team lv-team-${side}`}>
      {possession === side && side === "away" && <i className="lv-poss" aria-label="has possession" />}
      {t.logo && <img src={t.logo} alt="" />}
      <span style={{ color: t.color }}>{t.abbr}</span>
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
