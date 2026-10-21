import type { ReactNode } from "react";

// Every live view draws into the same 800×500 (16:10) canvas, scaled to fit
// whatever screen the display runs on. Colours are fixed dark values rather
// than the app's theme tokens — this is a dedicated display, and the
// broadcast-style layouts were designed against a dark background.
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

export const W = 800;
export const H = 500;

export function Screen({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg className="live-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
      <rect width={W} height={H} fill={C.bg} />
      {children}
    </svg>
  );
}

export function Panel({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={8} fill={C.panel} stroke={C.border} />;
}

export function Label({ x, y, children, anchor }: { x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontSize={11} fill={C.muted} letterSpacing={0.8} textAnchor={anchor}>
      {children}
    </text>
  );
}

// Top bar: league chip + LIVE pill on the left, a centre slot (usually the
// score), and a right-aligned status line.
export function Header({
  league,
  leagueColor,
  centre,
  right,
  live = true,
}: {
  league: string;
  leagueColor?: string;
  centre?: ReactNode;
  right?: ReactNode;
  live?: boolean;
}) {
  const chipW = league.length * 9 + 20;
  return (
    <g>
      <rect width={W} height={58} fill={C.panel} />
      <line x1={0} y1={58} x2={W} y2={58} stroke={C.border} />
      <rect x={18} y={17} width={chipW} height={24} rx={5} fill={leagueColor ?? C.border} fillOpacity={0.25} stroke={leagueColor ?? C.border} />
      <text x={18 + chipW / 2} y={34} fontSize={13} fontWeight={700} fill={C.text} textAnchor="middle">
        {league}
      </text>
      {live && (
        <g transform={`translate(${chipW + 28} 0)`}>
          <rect y={17} width={50} height={24} rx={12} fill={C.live} fillOpacity={0.15} />
          <circle cx={12} cy={29} r={4} fill={C.live} className="live-pulse" />
          <text x={20} y={34} fontSize={12} fontWeight={700} fill={C.live}>
            LIVE
          </text>
        </g>
      )}
      {centre}
      {typeof right === "string" ? (
        <text x={782} y={35} fontSize={15} fontWeight={600} fill={C.text} textAnchor="end">
          {right}
        </text>
      ) : (
        right
      )}
    </g>
  );
}

// "AWY 17 – 20 HOM" with each abbreviation in its team colour and an
// optional possession dot beside whoever has the ball.
export function ScoreLine({
  away,
  home,
  awayColor,
  homeColor,
  possession,
}: {
  away: { abbr: string; score: string };
  home: { abbr: string; score: string };
  awayColor: string;
  homeColor: string;
  possession?: "away" | "home";
}) {
  return (
    <text x={400} y={37} fontSize={20} fontWeight={800} fill={C.text} textAnchor="middle">
      {possession === "away" && <tspan fontSize={12}>{"● "}</tspan>}
      <tspan fill={awayColor}>{away.abbr}</tspan>
      {`  ${away.score} – ${home.score}  `}
      <tspan fill={homeColor}>{home.abbr}</tspan>
      {possession === "home" && <tspan fontSize={12}>{" ●"}</tspan>}
    </text>
  );
}

export function Footer({ children }: { children: ReactNode }) {
  return (
    <text x={18} y={490} fontSize={11} fill={C.muted}>
      {children}
    </text>
  );
}

// Long play-by-play lines would run off the canvas — SVG text doesn't wrap.
export const clip = (s: string | undefined, max: number) => (!s ? "" : s.length > max ? `${s.slice(0, max - 1)}…` : s);
