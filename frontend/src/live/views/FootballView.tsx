import type { FootballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { Below, C, LiveFrame, Line, Scoreboard, Side, SideLabel, Surface, useScoreFlash } from "../Layout";
import Field, { FIELD_H } from "../surfaces/Field";

// ESPN's yardLine counts from the HOME goal line. The field is drawn with the
// away end zone on the left (same order as the scoreboard), so the home goal
// line is at x = 110 and a spot sits at 110 - yardLine.
const fx = (yardsFromHomeGoal: number) => 110 - yardsFromHomeGoal;

function scoringLabel(delta: number): string {
  if (delta >= 6) return "Touchdown";
  if (delta === 3) return "Field goal";
  if (delta === 2) return "Two points";
  return "Extra point";
}

export default function FootballView({ data, league, leagueColor }: { data: FootballState; league: string; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const possession = data.possessionId === home?.id ? "home" : data.possessionId === away?.id ? "away" : undefined;
  const mid = FIELD_H / 2;
  const ball = data.ball;
  const towardHome = data.attackingHomeGoal; // home goal is on the right
  const winPct = data.homeWinPct;
  const teams = [
    { abbr: away?.abbr ?? "", color: awayColor },
    { abbr: home?.abbr ?? "", color: homeColor },
  ];
  const flash = useScoreFlash(away && home ? [Number(away.score), Number(home.score)] : undefined, teams, (d, team) => ({
    banner: `${scoringLabel(d)} · ${team}`,
    ms: d >= 6 ? 10000 : 6000,
  }));

  return (
    <LiveFrame
      layout="stack"
      league={league}
      leagueColor={leagueColor}
      live={data.state === "in"}
      centre={<Scoreboard away={{ ...away, color: awayColor }} home={{ ...home, color: homeColor }} possession={data.state === "in" ? possession : undefined} />}
      status={data.detail}
    >
      {flash}
      <Surface
        caption={
          <span>
            <span style={{ color: "#3b82f6" }}>▮</span> line of scrimmage · <span style={{ color: C.yellow }}>▮</span> first down · ⋯ this drive
          </span>
        }
      >
        <Field leftColor={awayColor} rightColor={homeColor} leftLabel={away?.abbr} rightLabel={home?.abbr}>
          {data.redZone && ball !== undefined && (
            <rect x={towardHome ? fx(20) : fx(100)} width={20} height={FIELD_H} fill={C.live} fillOpacity={0.16} />
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
                  d={towardHome ? `M${fx(ball) + 2} ${mid - 1} l1.5 1 l-1.5 1 z` : `M${fx(ball) - 2} ${mid - 1} l-1.5 1 l1.5 1 z`}
                  fill="#fff"
                />
              )}
            </g>
          )}
        </Field>
      </Surface>
      <Below
        left={
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6em", flexWrap: "wrap" }}>
              <span className="lv-big">{data.downText ?? (data.state === "pre" ? "Pregame" : data.state === "post" ? "Final" : "—")}</span>
              {data.spotText && <span style={{ color: C.muted, fontSize: "1.2em" }}>at {data.spotText}</span>}
              {data.redZone && (
                <span className="lv-pill" style={{ background: "rgb(239 68 68 / 0.2)", color: C.live }}>
                  Red zone
                </span>
              )}
            </div>
            <Line primary>{data.lastPlay ?? ""}</Line>
          </>
        }
        right={
          (data.driveSummary || winPct !== undefined || away?.timeoutsRemaining !== undefined) && (
            <Side>
              {data.driveSummary && (
                <div className="lv-row">
                  <SideLabel>Drive</SideLabel>
                  <span>{data.driveSummary}</span>
                </div>
              )}
              {(away?.timeoutsRemaining !== undefined || home?.timeoutsRemaining !== undefined) && (
                <div className="lv-row">
                  <SideLabel>Timeouts</SideLabel>
                  <span>
                    <span style={{ color: awayColor }}>{away?.abbr}</span> {away?.timeoutsRemaining ?? "–"} · <span style={{ color: homeColor }}>{home?.abbr}</span>{" "}
                    {home?.timeoutsRemaining ?? "–"}
                  </span>
                </div>
              )}
              {winPct !== undefined && (
                <>
                  <div className="lv-row">
                    <SideLabel>Win probability</SideLabel>
                    <span>
                      {away?.abbr} {Math.round((1 - winPct) * 100)}% · {home?.abbr} {Math.round(winPct * 100)}%
                    </span>
                  </div>
                  <div className="lv-bar">
                    <span style={{ width: `${(1 - winPct) * 100}%`, background: awayColor }} />
                    <span style={{ flex: 1, background: homeColor }} />
                  </div>
                </>
              )}
            </Side>
          )
        }
      />
    </LiveFrame>
  );
}
