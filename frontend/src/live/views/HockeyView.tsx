import type { HockeyState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { C, Footer, Header, Panel, Screen, ScoreLine, clip } from "../Screen";

// Rink in feet: 200 × 85, origin top-left. ESPN's shot coordinates are
// centred on centre ice (x -100..100, y -42.5..42.5).
const S = 3.1;
const X = 20;
const Y = 84;
const px = (ft: number) => X + ft * S;
const py = (ft: number) => Y + ft * S;
const RED = "#e5484d";
const BLUE = "#3b82f6";

function Rink() {
  const circles: [number, number][] = [
    [31, 20.5],
    [31, 64.5],
    [169, 20.5],
    [169, 64.5],
  ];
  const dots: [number, number][] = [
    [80, 20.5],
    [80, 64.5],
    [120, 20.5],
    [120, 64.5],
  ];
  return (
    <g>
      <rect x={X} y={Y} width={200 * S} height={85 * S} rx={28 * S} fill="#1d2733" stroke="#9fb2c4" strokeWidth={2} />
      <line x1={px(100)} x2={px(100)} y1={Y} y2={py(85)} stroke={RED} strokeWidth={4} />
      <line x1={px(75)} x2={px(75)} y1={Y} y2={py(85)} stroke={BLUE} strokeWidth={4} />
      <line x1={px(125)} x2={px(125)} y1={Y} y2={py(85)} stroke={BLUE} strokeWidth={4} />
      <line x1={px(11)} x2={px(11)} y1={py(4)} y2={py(81)} stroke={RED} strokeWidth={1.5} />
      <line x1={px(189)} x2={px(189)} y1={py(4)} y2={py(81)} stroke={RED} strokeWidth={1.5} />
      <circle cx={px(100)} cy={py(42.5)} r={15 * S} fill="none" stroke={BLUE} strokeWidth={1.5} />
      {circles.map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={px(x)} cy={py(y)} r={15 * S} fill="none" stroke={RED} strokeWidth={1.5} />
          <circle cx={px(x)} cy={py(y)} r={3} fill={RED} />
        </g>
      ))}
      {dots.map(([x, y]) => (
        <circle key={`d${x}${y}`} cx={px(x)} cy={py(y)} r={3} fill={RED} />
      ))}
      <path d={`M${px(11)} ${py(36.5)} A${6 * S} ${6 * S} 0 0 1 ${px(11)} ${py(48.5)} Z`} fill={BLUE} fillOpacity={0.35} />
      <path d={`M${px(189)} ${py(36.5)} A${6 * S} ${6 * S} 0 0 0 ${px(189)} ${py(48.5)} Z`} fill={BLUE} fillOpacity={0.35} />
      <rect x={px(7.7)} y={py(39.5)} width={3.3 * S} height={6 * S} fill="none" stroke="#9fb2c4" strokeWidth={1.5} />
      <rect x={px(189)} y={py(39.5)} width={3.3 * S} height={6 * S} fill="none" stroke="#9fb2c4" strokeWidth={1.5} />
    </g>
  );
}

export default function HockeyView({ data, leagueColor }: { data: HockeyState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const colorOf = (teamId: string) => (teamId === home?.id ? homeColor : awayColor);
  const s = (teamId: string | undefined, name: string) => data.stats[teamId ?? ""]?.[name] ?? "–";
  const pp = data.powerPlayTeamId ? (data.powerPlayTeamId === home?.id ? home : away) : undefined;
  const ppColor = pp ? colorOf(pp.id) : C.text;

  const rows: [string, string][] = [
    ["SOG", "shotsTotal"],
    ["Hits", "hits"],
    ["Blocks", "blockedShots"],
    ["Takeaways", "takeaways"],
    ["PP goals", "powerPlayGoals"],
  ];

  return (
    <Screen label="NHL live rink view">
      <Header
        league="NHL"
        leagueColor={leagueColor}
        live={data.state === "in"}
        centre={<ScoreLine away={away} home={home} awayColor={awayColor} homeColor={homeColor} />}
        right={data.detail}
      />
      <Rink />
      {data.shots
        .filter((sh) => !sh.goal)
        .map((sh, i) => (
          <circle key={i} cx={px(sh.x + 100)} cy={py(42.5 - sh.y)} r={3.8} fill={colorOf(sh.teamId)} fillOpacity={0.8} />
        ))}
      {data.shots
        .filter((sh) => sh.goal)
        .map((sh, i) => (
          <g key={`g${i}`}>
            <circle cx={px(sh.x + 100)} cy={py(42.5 - sh.y)} r={9} fill={colorOf(sh.teamId)} stroke="#fff" strokeWidth={2} />
            <text x={px(sh.x + 100)} y={py(42.5 - sh.y) + 4} fontSize={10} fontWeight={800} fill="#fff" textAnchor="middle">
              G
            </text>
          </g>
        ))}
      <text x={px(50)} y={py(85) + 16} fontSize={12} fontWeight={700} fill={awayColor} textAnchor="middle">
        {away?.abbr} attacking ←
      </text>
      <text x={px(150)} y={py(85) + 16} fontSize={12} fontWeight={700} fill={homeColor} textAnchor="middle">
        → {home?.abbr} attacking
      </text>

      <Panel x={656} y={84} w={128} h={264} />
      <text x={740} y={106} fontSize={11} fontWeight={700} fill={awayColor} textAnchor="end">
        {away?.abbr}
      </text>
      <text x={776} y={106} fontSize={11} fontWeight={700} fill={homeColor} textAnchor="end">
        {home?.abbr}
      </text>
      {rows.map(([label, name], i) => (
        <g key={label}>
          <text x={668} y={134 + i * 30} fontSize={12} fill={C.muted}>
            {label}
          </text>
          <text x={740} y={134 + i * 30} fontSize={13} fontWeight={700} fill={C.text} textAnchor="end">
            {s(away?.id, name)}
          </text>
          <text x={776} y={134 + i * 30} fontSize={13} fontWeight={700} fill={C.text} textAnchor="end">
            {s(home?.id, name)}
          </text>
        </g>
      ))}
      <text x={668} y={300} fontSize={11} fill={C.muted}>
        ● shot G goal
      </text>

      {pp && (
        <g>
          <rect x={20} y={384} width={240} height={36} rx={8} fill={ppColor} fillOpacity={0.18} stroke={ppColor} />
          <text x={36} y={407} fontSize={14} fontWeight={800} fill={ppColor}>
            POWER PLAY · {pp.abbr}
          </text>
        </g>
      )}
      <text x={pp ? 276 : 20} y={407} fontSize={13} fill={C.text}>
        {clip(data.lastGoal ? `Last goal: ${data.lastGoal}` : data.recent[0], pp ? 62 : 90)}
      </text>
      <text x={20} y={448} fontSize={13} fill={C.muted}>
        {clip(data.recent[0], 100)}
      </text>
      <Footer>ESPN play-by-play · shots shown at the net each team attacks</Footer>
    </Screen>
  );
}
