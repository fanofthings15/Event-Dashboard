import type { FootballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { C, Footer, Header, Label, Panel, Screen, ScoreLine, clip } from "../Screen";

// Field drawn with the HOME end zone on the left — ESPN's yardLine is
// measured from the home goal line, so the ball spot maps straight onto x.
const X0 = 30;
const FW = 740;
const YD = FW / 120;
const FY = 104;
const FH = 250;
const fx = (yardsFromHomeGoal: number) => X0 + (10 + yardsFromHomeGoal) * YD;

export default function FootballView({ data, league, leagueColor }: { data: FootballState; league: string; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const possession = data.possessionId ? (data.possessionId === home?.id ? "home" : data.possessionId === away?.id ? "away" : undefined) : undefined;
  const mid = FY + FH / 2;

  const stripes = [];
  for (let i = 1; i < 10; i += 2) stripes.push(<rect key={i} x={fx(i * 10)} y={FY} width={YD * 10} height={FH} fill="#226440" />);
  const lines = [];
  for (let yd = 0; yd <= 100; yd += 5) {
    const strong = yd % 50 === 0;
    lines.push(<line key={`l${yd}`} x1={fx(yd)} x2={fx(yd)} y1={FY} y2={FY + FH} stroke="#fff" strokeOpacity={strong ? 0.8 : 0.35} strokeWidth={strong ? 2 : 1} />);
    if (yd % 10 === 0 && yd > 0 && yd < 100) {
      const n = yd <= 50 ? yd : 100 - yd;
      for (const y of [FY + 26, FY + FH - 12]) {
        lines.push(
          <text key={`n${yd}${y}`} x={fx(yd)} y={y} fontSize={15} fontWeight={700} fill="#fff" fillOpacity={0.7} textAnchor="middle">
            {n}
          </text>
        );
      }
    }
  }

  const endZone = (team: typeof home, color: string, x: number, rot: number) => (
    <g>
      <rect x={x} y={FY} width={YD * 10} height={FH} fill={color} fillOpacity={0.8} />
      <text
        x={x + YD * 5}
        y={mid}
        fontSize={28}
        fontWeight={800}
        fill="#fff"
        fillOpacity={0.9}
        textAnchor="middle"
        dominantBaseline="middle"
        letterSpacing={5}
        transform={`rotate(${rot} ${x + YD * 5} ${mid})`}
      >
        {team?.abbr}
      </text>
    </g>
  );

  const ball = data.ball;
  const towardHome = data.attackingHomeGoal;
  const redZoneX = towardHome ? fx(0) : fx(80);
  const winPct = data.homeWinPct;

  return (
    <Screen label={`${league} live field view`}>
      <Header
        league={league}
        leagueColor={leagueColor}
        live={data.state === "in"}
        centre={<ScoreLine away={away} home={home} awayColor={awayColor} homeColor={homeColor} possession={possession} />}
        right={data.detail}
      />
      {data.driveSummary && (
        <text x={X0 + FW} y={88} fontSize={13} fill={C.muted} textAnchor="end">
          Drive: {data.driveSummary}
        </text>
      )}
      {(away?.timeoutsRemaining !== undefined || home?.timeoutsRemaining !== undefined) && (
        <text x={X0} y={88} fontSize={13} fill={C.muted}>
          Timeouts · {away?.abbr} {away?.timeoutsRemaining ?? "–"} · {home?.abbr} {home?.timeoutsRemaining ?? "–"}
        </text>
      )}

      <rect x={X0} y={FY} width={FW} height={FH} fill="#1e5a35" />
      {stripes}
      {data.redZone && <rect x={redZoneX} y={FY} width={YD * 20} height={FH} fill={C.live} fillOpacity={0.14} />}
      {endZone(home, homeColor, X0, -90)}
      {endZone(away, awayColor, fx(100), 90)}
      {lines}

      {ball !== undefined && (
        <g>
          {data.driveStart !== undefined && Math.abs(data.driveStart - ball) > 1 && (
            <g>
              <line x1={fx(data.driveStart)} x2={fx(ball)} y1={mid} y2={mid} stroke="#fff" strokeOpacity={0.5} strokeWidth={3} strokeDasharray="6 5" />
              <circle cx={fx(data.driveStart)} cy={mid} r={4} fill="#fff" fillOpacity={0.5} />
            </g>
          )}
          <line x1={fx(ball)} x2={fx(ball)} y1={FY} y2={FY + FH} stroke="#3b82f6" strokeWidth={4} />
          {data.firstDown !== undefined && (
            <line x1={fx(data.firstDown)} x2={fx(data.firstDown)} y1={FY} y2={FY + FH} stroke={C.yellow} strokeWidth={4} />
          )}
          <g className="live-pulse">
            <ellipse cx={fx(ball)} cy={mid} rx={11} ry={7} fill="#8a4a22" stroke="#fff" strokeWidth={1.2} />
            <line x1={fx(ball) - 5} x2={fx(ball) + 5} y1={mid} y2={mid} stroke="#fff" strokeWidth={1.2} />
          </g>
          {towardHome !== undefined && (
            <path
              d={towardHome ? `M ${fx(ball) - 18} ${mid - 9} l -12 9 l 12 9 z` : `M ${fx(ball) + 18} ${mid - 9} l 12 9 l -12 9 z`}
              fill="#fff"
              fillOpacity={0.85}
            />
          )}
        </g>
      )}

      <text x={X0} y={414} fontSize={40} fontWeight={800} fill={C.text}>
        {data.downText ?? (data.state === "pre" ? "Kickoff soon" : data.state === "post" ? "Final" : "—")}
      </text>
      {data.spotText && (
        <text x={X0 + (data.downText ? data.downText.length * 21 + 20 : 120)} y={414} fontSize={22} fontWeight={600} fill={C.muted}>
          at {data.spotText}
        </text>
      )}
      <text x={X0} y={448} fontSize={15} fill={C.text}>
        {clip(data.lastPlay, 70)}
      </text>

      {winPct !== undefined && (
        <g>
          <Panel x={560} y={384} w={210} h={68} />
          <Label x={575} y={406}>
            WIN PROBABILITY
          </Label>
          <rect x={575} y={416} width={180} height={10} rx={5} fill={homeColor} />
          <rect x={575} y={416} width={Math.max(0, Math.min(180, 180 * (1 - winPct)))} height={10} rx={5} fill={awayColor} />
          <text x={575} y={444} fontSize={12} fill={C.text}>
            {away?.abbr} {Math.round((1 - winPct) * 100)}%
          </text>
          <text x={755} y={444} fontSize={12} fill={C.text} textAnchor="end">
            {home?.abbr} {Math.round(winPct * 100)}%
          </text>
        </g>
      )}
      <Footer>ESPN · field position from the latest play</Footer>
    </Screen>
  );
}
