import type { ReactNode } from "react";

// NBA regulation court, top-down, in feet: 94 × 50. Rim centre 5.25 ft from
// the baseline, backboard at 4 ft, 16 ft lane 19 ft deep, 6 ft free-throw
// circle, 4 ft restricted arc, three-point line 22 ft in the corners
// (straight to 14 ft from the baseline) and a 23.75 ft arc.
export const COURT_W = 94;
export const COURT_H = 50;
export const RIM_X = 5.25;
const WOOD = "#d6a56a";
const LINE = { fill: "none", stroke: "#fff", strokeWidth: 0.22 } as const;

function Half({ side, paint }: { side: 0 | 1; paint: string }) {
  const m = (v: number) => (side ? COURT_W - v : v);
  const toward = side ? 0 : 1; // arc sweep that bulges toward centre court
  const away = side ? 1 : 0;
  const laneX = Math.min(m(0), m(19));
  return (
    <g>
      <rect x={laneX} y={17} width={19} height={16} {...LINE} fill={paint} />
      {/* free-throw circle: solid half outside the lane, dashed half inside */}
      <path d={`M${m(19)} 19 A6 6 0 0 ${toward} ${m(19)} 31`} {...LINE} />
      <path d={`M${m(19)} 19 A6 6 0 0 ${away} ${m(19)} 31`} {...LINE} strokeDasharray="1 0.8" />
      {[7, 8, 11, 14].map((d) => (
        <g key={d}>
          <line x1={m(d)} x2={m(d)} y1={17} y2={16.4} stroke="#fff" strokeWidth={0.22} />
          <line x1={m(d)} x2={m(d)} y1={33} y2={33.6} stroke="#fff" strokeWidth={0.22} />
        </g>
      ))}
      <path d={`M${m(0)} 3 L${m(14.2)} 3 A23.75 23.75 0 0 ${toward} ${m(14.2)} 47 L${m(0)} 47`} {...LINE} />
      <path d={`M${m(4)} 21 L${m(RIM_X)} 21 A4 4 0 0 ${toward} ${m(RIM_X)} 29 L${m(4)} 29`} {...LINE} />
      <line x1={m(4)} x2={m(4)} y1={22} y2={28} stroke="#fff" strokeWidth={0.35} />
      <circle cx={m(RIM_X)} cy={25} r={0.75} fill="none" stroke="#f97316" strokeWidth={0.25} />
    </g>
  );
}

export default function Court({ children, awayPaint, homePaint }: { children?: ReactNode; awayPaint: string; homePaint: string }) {
  return (
    <svg viewBox="-1 -1 96 52" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Basketball court">
      <defs>
        <linearGradient id="court-wood" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#dcae74" />
          <stop offset="1" stopColor={WOOD} />
        </linearGradient>
      </defs>
      <rect width={COURT_W} height={COURT_H} fill="url(#court-wood)" />
      {Array.from({ length: 24 }, (_, i) => (
        <line key={i} x1={0} x2={COURT_W} y1={i * 2.1 + 1} y2={i * 2.1 + 1} stroke="#000" strokeOpacity={0.05} strokeWidth={0.08} />
      ))}
      <rect width={COURT_W} height={COURT_H} {...LINE} strokeWidth={0.4} />
      <line x1={47} x2={47} y1={0} y2={COURT_H} {...LINE} />
      <circle cx={47} cy={25} r={6} {...LINE} />
      <circle cx={47} cy={25} r={2} {...LINE} />
      <Half side={0} paint={awayPaint} />
      <Half side={1} paint={homePaint} />
      {children}
    </svg>
  );
}
