import type { ReactNode } from "react";

// Baseball field, top-down, in feet with home plate at the origin and y
// pointing out to centre field (drawn flipped, so up is up on screen).
// 90 ft base paths, mound 60.5 ft out (9 ft dirt circle), 95 ft infield-dirt
// arc around the mound, 13 ft dirt circle at home, 330 ft foul lines and a
// 400 ft centre-field fence.
const GRASS = "#2f7a3b";
const DIRT = "#b98957";
const TRACK = "#9c6b45";
const BASE = 90 / Math.SQRT2; // 63.64

// Circle through both foul poles and dead centre.
const POLE = 330 / Math.SQRT2;
const FENCE_CY = (2 * POLE * POLE - 400 * 400 + 0) / (2 * POLE - 800);
const FENCE_R = 400 - FENCE_CY;

// Where a circle centred on the y axis at cy crosses the foul line y = |x|.
function foulLineHit(cy: number, r: number): number {
  return (2 * cy + Math.sqrt(4 * cy * cy - 8 * (cy * cy - r * r))) / 4;
}

const P = (x: number, y: number) => `${x.toFixed(2)} ${(-y).toFixed(2)}`;

function wedge(cy: number, r: number): string {
  const t = foulLineHit(cy, r);
  return `M${P(0, 0)} L${P(-t, t)} A${r} ${r} 0 0 1 ${P(t, t)} Z`;
}

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

export default function Ballpark({ children }: { children?: ReactNode }) {
  const infieldT = foulLineHit(60.5, 95);
  return (
    <svg viewBox="-345 -425 690 445" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Baseball field">
      <path d={wedge(FENCE_CY, FENCE_R)} fill={TRACK} />
      <path d={wedge(FENCE_CY, FENCE_R - 15)} fill={GRASS} />
      <path d={`M${P(0, 0)} L${P(-infieldT, infieldT)} A95 95 0 0 1 ${P(infieldT, infieldT)} Z`} fill={DIRT} />
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
      <rect x={-1} y={-61} width={2} height={0.6} fill="#fff" />
      <path d={`M${P(-POLE, POLE)} L${P(0, 0)} L${P(POLE, POLE)}`} fill="none" stroke="#fff" strokeWidth={1.2} />
      <path d={`M${P(-POLE, POLE)} A${FENCE_R} ${FENCE_R} 0 0 1 ${P(POLE, POLE)}`} fill="none" stroke="#1f2937" strokeWidth={4} />
      <path d={`M${P(-1.4, 0)} L${P(1.4, 0)} L${P(1.4, -1)} L${P(0, -2.2)} L${P(-1.4, -1)} Z`} transform="scale(2.4)" fill="#fff" />
      {children}
    </svg>
  );
}
