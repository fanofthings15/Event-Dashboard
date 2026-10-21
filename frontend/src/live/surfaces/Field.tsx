import type { ReactNode } from "react";

// American football field, top-down, in yards: 120 × 53⅓ including both
// 10-yard end zones. Hash marks every yard at the sidelines and at the NFL
// inbound lines (70 ft 9 in from each sideline); numbers every 10 yards with
// arrows pointing to the nearer goal. x = 10 is the left goal line.
export const FIELD_W = 120;
export const FIELD_H = 160 / 3;
const HASH_IN = 23.58;

function EndZone({ x, color, label, rotate }: { x: number; color: string; label?: string; rotate: number }) {
  const cx = x + 5;
  const cy = FIELD_H / 2;
  return (
    <g>
      <rect x={x} width={10} height={FIELD_H} fill={color} />
      <text
        x={cx}
        y={cy}
        fontSize={5}
        fontWeight={800}
        fill="#fff"
        fillOpacity={0.9}
        textAnchor="middle"
        dominantBaseline="central"
        letterSpacing={1.2}
        transform={`rotate(${rotate} ${cx} ${cy})`}
      >
        {label}
      </text>
    </g>
  );
}

export default function Field({
  children,
  leftColor,
  rightColor,
  leftLabel,
  rightLabel,
}: {
  children?: ReactNode;
  leftColor: string;
  rightColor: string;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const marks: ReactNode[] = [];
  for (let yd = 1; yd < 100; yd++) {
    if (yd % 5 === 0) continue;
    const x = 10 + yd;
    for (const [y1, y2] of [
      [0.3, 1],
      [FIELD_H - 1, FIELD_H - 0.3],
      [HASH_IN - 0.67, HASH_IN],
      [FIELD_H - HASH_IN, FIELD_H - HASH_IN + 0.67],
    ]) {
      marks.push(<line key={`${yd}-${y1}`} x1={x} x2={x} y1={y1} y2={y2} stroke="#fff" strokeWidth={0.12} />);
    }
  }
  for (let yd = 0; yd <= 100; yd += 5) {
    const goal = yd === 0 || yd === 100;
    marks.push(<line key={`l${yd}`} x1={10 + yd} x2={10 + yd} y1={0} y2={FIELD_H} stroke="#fff" strokeWidth={goal ? 0.33 : 0.15} />);
  }
  for (let yd = 10; yd <= 90; yd += 10) {
    const n = yd <= 50 ? yd : 100 - yd;
    const x = 10 + yd;
    const arrowDir = yd < 50 ? -1 : yd > 50 ? 1 : 0;
    for (const [y, rot] of [
      [FIELD_H - 9, 0],
      [9, 180],
    ] as const) {
      marks.push(
        <g key={`n${yd}${y}`} transform={`rotate(${rot} ${x} ${y})`}>
          <text x={x} y={y} fontSize={2.6} fontWeight={700} fill="#fff" fillOpacity={0.85} textAnchor="middle" dominantBaseline="central" letterSpacing={0.15}>
            {n}
          </text>
          {arrowDir !== 0 && (
            <path
              d={`M${x + (rot ? -arrowDir : arrowDir) * 2.9} ${y - 0.45} l${(rot ? -arrowDir : arrowDir) * 0.8} 0.45 l${(rot ? arrowDir : -arrowDir) * 0.8} 0.45 z`}
              fill="#fff"
              fillOpacity={0.85}
            />
          )}
        </g>
      );
    }
  }

  return (
    <svg viewBox={`-0.5 -0.5 ${FIELD_W + 1} ${FIELD_H + 1}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Football field">
      <rect width={FIELD_W} height={FIELD_H} fill="#2f7a3b" />
      {Array.from({ length: 10 }, (_, i) =>
        i % 2 ? <rect key={i} x={10 + i * 10} width={10} height={FIELD_H} fill="#2b7136" /> : null
      )}
      <EndZone x={0} color={leftColor} label={leftLabel} rotate={-90} />
      <EndZone x={110} color={rightColor} label={rightLabel} rotate={90} />
      {marks}
      <rect width={FIELD_W} height={FIELD_H} fill="none" stroke="#fff" strokeWidth={0.35} />
      {children}
    </svg>
  );
}
