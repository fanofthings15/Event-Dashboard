import { useId, type ReactNode } from "react";

// NHL regulation rink, top-down, in feet: 200 × 85 with 28 ft corner radii.
// Goal lines 11 ft from the end boards, blue lines 64 ft out from those,
// end-zone faceoff spots 20 ft from the goal line and 22 ft either side of
// centre, neutral-zone spots 5 ft outside the blue lines.
const RED = "#c8102e";
const BLUE = "#0033a0";
const ICE = "#eef3f7";
export const RINK_W = 200;
export const RINK_H = 85;
const R = 28;

// ESPN shot coordinates are centred on centre ice (x -100..100, y -42.5..42.5,
// y up). A few land just outside the boards (tracking noise, shots off the
// corner boards) — those are pulled back inside the rounded corners so no
// marker is ever drawn off the ice.
export function rinkPoint(x: number, y: number): [number, number] {
  let px = Math.min(RINK_W - 1, Math.max(1, x + 100));
  let py = Math.min(RINK_H - 1, Math.max(1, 42.5 - y));
  const cx = px < R ? R : px > RINK_W - R ? RINK_W - R : px;
  const cy = py < R ? R : py > RINK_H - R ? RINK_H - R : py;
  if (cx !== px && cy !== py) {
    const dx = px - cx;
    const dy = py - cy;
    const d = Math.hypot(dx, dy);
    const max = R - 1.5;
    if (d > max) {
      px = cx + (dx / d) * max;
      py = cy + (dy / d) * max;
    }
  }
  return [px, py];
}

function FaceoffCircle({ x, y }: { x: number; y: number }) {
  const hashes = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => <line key={`h${sx}${sy}`} x1={x + sx * 2.875} x2={x + sx * 2.875} y1={y + sy * 14.7} y2={y + sy * 16.9} stroke={RED} strokeWidth={0.3} />)
  );
  const ells = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => (
      <path key={`l${sx}${sy}`} d={`M${x + sx * 6} ${y + sy * 0.75} H${x + sx * 2} V${y + sy * 3.75}`} fill="none" stroke={RED} strokeWidth={0.25} />
    ))
  );
  return (
    <g>
      <circle cx={x} cy={y} r={15} fill="none" stroke={RED} strokeWidth={0.35} />
      {hashes}
      {ells}
      <circle cx={x} cy={y} r={1} fill={RED} />
    </g>
  );
}

function End({ side }: { side: 0 | 1 }) {
  const m = (v: number) => (side ? RINK_W - v : v);
  const gx = m(11);
  const bulge = side ? 0 : 1;
  return (
    <g>
      {/* trapezoid behind the net */}
      <line x1={gx} y1={31.5} x2={m(0)} y2={28.5} stroke={RED} strokeWidth={0.25} />
      <line x1={gx} y1={53.5} x2={m(0)} y2={56.5} stroke={RED} strokeWidth={0.25} />
      <line x1={gx} x2={gx} y1={0} y2={RINK_H} stroke={RED} strokeWidth={0.35} />
      <path d={`M${gx} 36.5 A6 6 0 0 ${bulge} ${gx} 48.5 Z`} fill="#9cc7ef" stroke={RED} strokeWidth={0.25} />
      <rect x={side ? gx : gx - 3.33} y={39.5} width={3.33} height={6} fill="#d1d5db" stroke={RED} strokeWidth={0.35} />
      <FaceoffCircle x={m(31)} y={20.5} />
      <FaceoffCircle x={m(31)} y={64.5} />
      <circle cx={m(80)} cy={20.5} r={1} fill={RED} />
      <circle cx={m(80)} cy={64.5} r={1} fill={RED} />
    </g>
  );
}

// A team-coloured band beyond each end of the rink marks whose end it is
// (the side that team shoots at, same left/right order as the scoreboard).
function EndBand({ side, team }: { side: 0 | 1; team: { abbr: string; color: string } }) {
  const x = side ? RINK_W + 2.5 : -12.5;
  const cx = x + 5;
  return (
    <g>
      <rect x={x} y={8} width={10} height={RINK_H - 16} rx={3} fill={team.color} />
      <text
        x={cx}
        y={RINK_H / 2}
        fontSize={5}
        fontWeight={900}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
        letterSpacing={1}
        transform={`rotate(${side ? 90 : -90} ${cx} ${RINK_H / 2})`}
      >
        {team.abbr}
      </text>
    </g>
  );
}

export default function Rink({ children, left, right }: { children?: ReactNode; left?: { abbr: string; color: string }; right?: { abbr: string; color: string } }) {
  const clip = useId();
  const pad = left || right ? 13.5 : 1.5;
  return (
    <svg viewBox={`${-pad} -1.5 ${RINK_W + pad * 2} 88`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Hockey rink">
      {left && <EndBand side={0} team={left} />}
      {right && <EndBand side={1} team={right} />}
      <defs>
        <clipPath id={clip}>
          <rect width={RINK_W} height={RINK_H} rx={R} />
        </clipPath>
      </defs>
      <rect width={RINK_W} height={RINK_H} rx={R} fill={ICE} />
      <g clipPath={`url(#${clip})`}>
        <rect x={74.5} width={1} height={RINK_H} fill={BLUE} />
        <rect x={124.5} width={1} height={RINK_H} fill={BLUE} />
        <rect x={99.5} width={1} height={RINK_H} fill={RED} />
        <circle cx={100} cy={42.5} r={15} fill="none" stroke={BLUE} strokeWidth={0.35} />
        <circle cx={100} cy={42.5} r={0.6} fill={BLUE} />
        <path d="M90 85 A10 10 0 0 1 110 85" fill="none" stroke={RED} strokeWidth={0.3} />
        <End side={0} />
        <End side={1} />
        {children}
      </g>
      <rect width={RINK_W} height={RINK_H} rx={R} fill="none" stroke="#2a3140" strokeWidth={1.2} />
    </svg>
  );
}
