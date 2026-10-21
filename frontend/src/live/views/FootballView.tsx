import type { FootballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { C, LiveFrame, Line, Scoreboard, Side, SideLabel, Source, Surface } from "../Layout";
import Field, { FIELD_H } from "../surfaces/Field";

// ESPN's yardLine counts from the HOME goal line, so the home end zone is
// drawn on the left and a spot maps straight onto x (10 + yardLine).
const fx = (yardsFromHomeGoal: number) => 10 + yardsFromHomeGoal;

export default function FootballView({ data, league, leagueColor }: { data: FootballState; league: string; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const possession = data.possessionId === home?.id ? "home" : data.possessionId === away?.id ? "away" : undefined;
  const mid = FIELD_H / 2;
  const ball = data.ball;
  const towardHome = data.attackingHomeGoal;
  const winPct = data.homeWinPct;

  return (
    <LiveFrame
      league={league}
      leagueColor={leagueColor}
      live={data.state === "in"}
      centre={<Scoreboard away={{ ...away, color: awayColor }} home={{ ...home, color: homeColor }} possession={data.state === "in" ? possession : undefined} />}
      status={data.detail}
      footer={
        <>
          <Line primary>{data.lastPlay ?? ""}</Line>
          <Source>ESPN · field position from the latest play</Source>
        </>
      }
    >
      <Surface>
        <Field leftColor={homeColor} rightColor={awayColor} leftLabel={home?.abbr} rightLabel={away?.abbr}>
          {data.redZone && ball !== undefined && (
            <rect x={towardHome ? fx(0) : fx(80)} width={20} height={FIELD_H} fill={C.live} fillOpacity={0.16} />
          )}
          {ball !== undefined && (
            <g>
              {data.driveStart !== undefined && Math.abs(data.driveStart - ball) > 1 && (
                <g>
                  <line x1={fx(data.driveStart)} x2={fx(ball)} y1={mid} y2={mid} stroke="#fff" strokeOpacity={0.6} strokeWidth={0.35} strokeDasharray="1 0.8" />
                  <circle cx={fx(data.driveStart)} cy={mid} r={0.5} fill="#fff" fillOpacity={0.6} />
                </g>
              )}
              <line x1={fx(ball)} x2={fx(ball)} y1={0} y2={FIELD_H} stroke="#3b82f6" strokeWidth={0.45} />
              {data.firstDown !== undefined && <line x1={fx(data.firstDown)} x2={fx(data.firstDown)} y1={0} y2={FIELD_H} stroke={C.yellow} strokeWidth={0.45} />}
              <g className="live-pulse">
                <ellipse cx={fx(ball)} cy={mid} rx={1.3} ry={0.8} fill="#8a4a22" stroke="#fff" strokeWidth={0.15} />
                <line x1={fx(ball) - 0.6} x2={fx(ball) + 0.6} y1={mid} y2={mid} stroke="#fff" strokeWidth={0.15} />
              </g>
              {towardHome !== undefined && (
                <path
                  d={towardHome ? `M${fx(ball) - 2} ${mid - 1} l-1.5 1 l1.5 1 z` : `M${fx(ball) + 2} ${mid - 1} l1.5 1 l-1.5 1 z`}
                  fill="#fff"
                />
              )}
            </g>
          )}
        </Field>
      </Surface>
      <Side>
        <div className="lv-big">{data.downText ?? (data.state === "pre" ? "Pregame" : data.state === "post" ? "Final" : "—")}</div>
        {data.spotText && <div>at {data.spotText}</div>}
        {data.redZone && (
          <span className="lv-pill" style={{ background: "rgb(239 68 68 / 0.2)", color: C.live, alignSelf: "flex-start" }}>
            Red zone
          </span>
        )}
        {data.driveSummary && (
          <>
            <SideLabel>Drive</SideLabel>
            <div>{data.driveSummary}</div>
          </>
        )}
        {(away?.timeoutsRemaining !== undefined || home?.timeoutsRemaining !== undefined) && (
          <>
            <SideLabel>Timeouts</SideLabel>
            <div className="lv-row">
              <span style={{ color: awayColor }}>{away?.abbr}</span>
              <span>{away?.timeoutsRemaining ?? "–"}</span>
            </div>
            <div className="lv-row">
              <span style={{ color: homeColor }}>{home?.abbr}</span>
              <span>{home?.timeoutsRemaining ?? "–"}</span>
            </div>
          </>
        )}
        {winPct !== undefined && (
          <>
            <SideLabel>Win probability</SideLabel>
            <div className="lv-bar">
              <span style={{ width: `${(1 - winPct) * 100}%`, background: awayColor }} />
              <span style={{ flex: 1, background: homeColor }} />
            </div>
            <div className="lv-row">
              <span>
                {away?.abbr} {Math.round((1 - winPct) * 100)}%
              </span>
              <span>
                {home?.abbr} {Math.round(winPct * 100)}%
              </span>
            </div>
          </>
        )}
      </Side>
    </LiveFrame>
  );
}
