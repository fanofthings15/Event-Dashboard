import type { ReactNode } from "react";

// Baseball field, top-down, in feet with home plate at the origin and y
// pointing out to centre field (drawn flipped, so up is up on screen).
// 90 ft base paths, mound 60.5 ft out (9 ft dirt circle), 95 ft infield-dirt
// arc around the mound, 13 ft dirt circle at home. The outfield wall comes
// from the real ballpark (MLB Stats API fieldInfo) when known.
const GRASS = "#2f7a3b";
const DIRT = "#b98957";
const TRACK = "#9c6b45";
const BASE = 90 / Math.SQRT2; // 63.64

export interface FenceDistances {
  leftLine: number;
  left: number;
  leftCenter: number;
  center: number;
  rightCenter: number;
  right?: number; // not every park reports it
  rightLine: number;
}

const GENERIC: FenceDistances = { leftLine: 330, left: 370, leftCenter: 385, center: 400, rightCenter: 385, rightLine: 330 };

// Angle of each fieldInfo distance, measured from the centre-field line
// (left negative): foul lines at 45°, the "left/right" readings about 34°,
// the alleys about 20°.
const ANGLES = [-45, -34, -20, 0, 20, 34, 45];

const P = (x: number, y: number) => `${x.toFixed(1)} ${(-y).toFixed(1)}`;

// A smooth wall through the seven measured points (Catmull-Rom), sampled
// densely so the warning track can be an exact inset of it.
function wallPoints(f: FenceDistances, inset = 0): [number, number][] {
  const dist = [f.leftLine, f.left, f.leftCenter, f.center, f.rightCenter, f.right ?? (f.rightCenter + f.rightLine) / 2, f.rightLine];
  const polar = ANGLES.map((a, i) => {
    const r = Math.max(50, dist[i] - inset);
    const rad = (a * Math.PI) / 180;
    return [r * Math.sin(rad), r * Math.cos(rad)] as [number, number];
  });
  const out: [number, number][] = [];
  for (let i = 0; i < polar.length - 1; i++) {
    const p0 = polar[Math.max(0, i - 1)];
    const p1 = polar[i];
    const p2 = polar[i + 1];
    const p3 = polar[Math.min(polar.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.1) {
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (k: 0 | 1) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(polar[polar.length - 1]);
  return out;
}

const wedge = (pts: [number, number][]) => `M${P(0, 0)} L${pts.map(([x, y]) => P(x, y)).join(" L")} Z`;

// Where the 95 ft infield arc around the mound crosses the foul line y = |x|.
const INFIELD_T = (2 * 60.5 + Math.sqrt(4 * 60.5 * 60.5 - 8 * (60.5 * 60.5 - 95 * 95))) / 4;

export const BASES = {
  first: [BASE, BASE] as const,
  second: [0, 2 * BASE] as const,
  third: [-BASE, BASE] as const,
};

export function Base({ at, on }: { at: readonly [number, number]; on: boolean }) {
  const [x, y] = at;
  return (
    <g>
      {on && <circle cx={x} cy={-y} r={16} fill="#facc15" fillOpacity={0.35} className="live-pulse" />}
      <rect x={x - 6} y={-y - 6} width={12} height={12} transform={`rotate(45 ${x} ${-y})`} fill={on ? "#facc15" : "#fff"} stroke="#1b1b1b" strokeWidth={0.6} />
    </g>
  );
}

export default function Ballpark({ children, fence }: { children?: ReactNode; fence?: FenceDistances }) {
  const f = fence ?? GENERIC;
  const wall = wallPoints(f);
  const grass = wallPoints(f, 15);
  // room beyond the wall for home runs to land in
  const maxY = Math.max(...wall.map((p) => p[1])) + 55;
  const maxX = Math.max(...wall.map((p) => Math.abs(p[0]))) + 35;
  return (
    <svg viewBox={`${-maxX} ${-maxY} ${maxX * 2} ${maxY + 25}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Baseball field">
      <path d={wedge(wall)} fill={TRACK} />
      <path d={wedge(grass)} fill={GRASS} />
      <path d={`M${P(0, 0)} L${P(-INFIELD_T, INFIELD_T)} A95 95 0 0 1 ${P(INFIELD_T, INFIELD_T)} Z`} fill={DIRT} />
      <polygon
        points={[
          [0, 12],
          [BASE - 9, BASE],
          [0, 2 * BASE - 12],
          [-(BASE - 9), BASE],
        ]
          .map(([x, y]) => P(x, y))
          .join(" ")}
        fill={GRASS}
      />
      <circle cx={0} cy={0} r={13} fill={DIRT} />
      <circle cx={0} cy={-60.5} r={9} fill={DIRT} />
      <path d={`M${P(wall[0][0], wall[0][1])} L${P(0, 0)} L${P(wall.at(-1)![0], wall.at(-1)![1])}`} fill="none" stroke="#fff" strokeWidth={1.2} />
      <path d={`M${wall.map(([x, y]) => P(x, y)).join(" L")}`} fill="none" stroke="#1f2937" strokeWidth={5} strokeLinejoin="round" />
      {[
        [f.leftLine, ANGLES[0]],
        [f.leftCenter, ANGLES[2]],
        [f.center, ANGLES[3]],
        [f.rightCenter, ANGLES[4]],
        [f.rightLine, ANGLES[6]],
      ].map(([d, a]) => {
        const rad = (a * Math.PI) / 180;
        const r = d - 26;
        return (
          <text key={a} x={r * Math.sin(rad)} y={-r * Math.cos(rad)} fontSize={13} fontWeight={700} fill="#fff" fillOpacity={0.7} textAnchor="middle" dominantBaseline="central">
            {d}
          </text>
        );
      })}
      <path d={`M${P(-1.4, 0)} L${P(1.4, 0)} L${P(1.4, -1)} L${P(0, -2.2)} L${P(-1.4, -1)} Z`} transform="scale(2.4)" fill="#fff" />
      {children}
    </svg>
  );
}
