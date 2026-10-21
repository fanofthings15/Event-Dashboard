import type { BasketballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { C, Footer, Header, Panel, Screen, ScoreLine, clip } from "../Screen";

const S = 6.6; // px per foot
const X = 20;
const Y = 78;
const px = (ft: number) => X + ft * S;
const py = (ft: number) => Y + ft * S;
const LINE = { fill: "none", stroke: "#e9d8bd", strokeOpacity: 0.55, strokeWidth: 1.6 } as const;

// One half of the court (side 0 = left basket, side 1 = right), drawn in
// feet: 94 × 50 court, hoop 5.25 ft from the baseline, 23.75 ft arc meeting
// 22 ft corner threes.
function Half({ side }: { side: 0 | 1 }) {
  const m = (f: number) => (side ? 94 - f : f);
  const sweep = side ? 0 : 1;
  return (
    <g>
      <rect x={px(Math.min(m(0), m(19)))} y={py(17)} width={19 * S} height={16 * S} {...LINE} fill="#4a3424" />
      <circle cx={px(m(19))} cy={py(25)} r={6 * S} {...LINE} />
      <line x1={px(m(4))} x2={px(m(4))} y1={py(22)} y2={py(28)} stroke="#e9d8bd" strokeWidth={2} />
      <circle cx={px(m(5.25))} cy={py(25)} r={0.75 * S} fill="none" stroke="#f97316" strokeWidth={2} />
      <path d={`M${px(m(0))} ${py(3)} L${px(m(14.2))} ${py(3)} A${23.75 * S} ${23.75 * S} 0 0 ${sweep} ${px(m(14.2))} ${py(47)} L${px(m(0))} ${py(47)}`} {...LINE} />
    </g>
  );
}

const stat = (stats: Record<string, string> | undefined, ...names: string[]) => {
  for (const n of names) if (stats?.[n]) return stats[n];
  return "–";
};

export default function BasketballView({ data, leagueColor }: { data: BasketballState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const awayStats = data.stats[away?.id ?? ""];
  const homeStats = data.stats[home?.id ?? ""];

  // ESPN shot spots are half-court feet: x across the width, y out from the
  // rim (not the baseline — an "18-foot pullup" logged at (30, 18) is only
  // 18 ft with the rim at y 0), so the hoop's 5.25 ft is added back here.
  // Away shots go on the left basket, home on the right, so the two teams'
  // charts never overlap.
  const shots = data.shots.map((s, i) => {
    const isHome = s.teamId === home?.id;
    const cx = px(isHome ? 94 - 5.25 - s.y : 5.25 + s.y);
    const cy = py(isHome ? 50 - s.x : s.x);
    const color = isHome ? homeColor : awayColor;
    return s.made ? (
      <circle key={i} cx={cx} cy={cy} r={5} fill={color} stroke={C.bg} strokeWidth={1} />
    ) : (
      <path key={i} d={`M${cx - 4} ${cy - 4} L${cx + 4} ${cy + 4} M${cx + 4} ${cy - 4} L${cx - 4} ${cy + 4}`} stroke={color} strokeOpacity={0.75} strokeWidth={2} />
    );
  });

  const rows: [string, string][] = [
    ["FG", "fieldGoalsMade-fieldGoalsAttempted"],
    ["3PT", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"],
    ["FT", "freeThrowsMade-freeThrowsAttempted"],
    ["REB", "totalRebounds"],
    ["AST", "assists"],
    ["TO", "totalTurnovers"],
    ["Fouls", "fouls"],
  ];

  return (
    <Screen label="NBA live shot chart">
      <Header
        league="NBA"
        leagueColor={leagueColor}
        live={data.state === "in"}
        centre={<ScoreLine away={away} home={home} awayColor={awayColor} homeColor={homeColor} />}
        right={data.detail}
      />
      <rect x={X} y={Y} width={94 * S} height={50 * S} fill="#3b2b1e" />
      <rect x={X} y={Y} width={94 * S} height={50 * S} {...LINE} />
      <line x1={px(47)} x2={px(47)} y1={Y} y2={py(50)} {...LINE} />
      <circle cx={px(47)} cy={py(25)} r={6 * S} {...LINE} />
      <Half side={0} />
      <Half side={1} />
      <text x={px(23.5)} y={py(50) - 8} fontSize={12} fontWeight={700} fill={awayColor} textAnchor="middle">
        {away?.abbr} shots
      </text>
      <text x={px(70.5)} y={py(50) - 8} fontSize={12} fontWeight={700} fill={homeColor} textAnchor="middle">
        {home?.abbr} shots
      </text>
      {shots}

      <Panel x={650} y={78} w={134} h={330} />
      <text x={724} y={100} fontSize={11} fontWeight={700} fill={awayColor} textAnchor="end">
        {away?.abbr}
      </text>
      <text x={774} y={100} fontSize={11} fontWeight={700} fill={homeColor} textAnchor="end">
        {home?.abbr}
      </text>
      {rows.map(([label, name], i) => (
        <g key={label}>
          <text x={660} y={128 + i * 30} fontSize={11.5} fill={C.muted}>
            {label}
          </text>
          <text x={724} y={128 + i * 30} fontSize={12} fontWeight={700} fill={C.text} textAnchor="end">
            {stat(awayStats, name)}
          </text>
          <text x={774} y={128 + i * 30} fontSize={12} fontWeight={700} fill={C.text} textAnchor="end">
            {stat(homeStats, name)}
          </text>
        </g>
      ))}
      <text x={660} y={384} fontSize={11} fill={C.muted}>
        ● made ✕ missed
      </text>

      <text x={20} y={440} fontSize={15} fill={C.text}>
        {clip(data.recent[0], 90)}
      </text>
      <text x={20} y={462} fontSize={13} fill={C.muted}>
        {clip(data.recent[1], 100)}
      </text>
      <Footer>ESPN play-by-play · free throws aren't charted</Footer>
    </Screen>
  );
}
