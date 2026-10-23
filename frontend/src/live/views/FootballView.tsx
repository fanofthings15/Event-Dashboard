import type { FootballState } from "../liveTypes";
import { teamColors, teamLabel } from "../teamColors";
import { Below, C, LiveFrame, Line, Scoreboard, Side, SideLabel, Surface, useScoreFlash } from "../Layout";
import Field, { FIELD_H, HASH_IN } from "../surfaces/Field";
import { FootballPlay, playKind } from "../surfaces/PlayAnimations";

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

// The field with the line of scrimmage, first-down line, this drive and the
// play animation — shared by the full view and the multi-game tiles.
export function FootballSurface({ data }: { data: FootballState }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const mid = FIELD_H / 2;
  const ball = data.ball;
  const towardHome = data.attackingHomeGoal; // home goal is on the right
  const offense = (towardHome ?? data.possessionId !== home?.id) ? awayColor : homeColor;
  // The next snap sits on the hash the last play ended toward, or in the middle.
  const ballY = mid + (data.nextHash === "top" ? -1 : data.nextHash === "bottom" ? 1 : 0) * (mid - HASH_IN);
  const m = data.motion;
  return (
    <Field leftColor={awayColor} rightColor={homeColor} leftLabel={teamLabel(away)} rightLabel={teamLabel(home)}>
      {data.redZone && ball !== undefined && (
        <rect x={towardHome ? fx(20) : fx(100)} width={20} height={FIELD_H} fill={C.live} fillOpacity={0.16} />
      )}
      {ball !== undefined && (
        <g>
          {/* this drive, as a bar along the far sideline, out of the play's way */}
          {data.driveStart !== undefined && Math.abs(data.driveStart - ball) > 0.5 && (
            <g>
              <rect x={Math.min(fx(data.driveStart), fx(ball))} width={Math.abs(data.driveStart - ball)} y={0.25} height={1.1} fill={offense} stroke="#fff" strokeWidth={0.12} />
              <circle cx={fx(data.driveStart)} cy={0.8} r={0.75} fill="#fff" />
            </g>
          )}
          <line x1={fx(ball)} x2={fx(ball)} y1={0} y2={FIELD_H} stroke="#3b82f6" strokeWidth={0.6} />
          {data.firstDown !== undefined && <line x1={fx(data.firstDown)} x2={fx(data.firstDown)} y1={0} y2={FIELD_H} stroke={C.yellow} strokeWidth={0.6} />}
        </g>
      )}
      <FootballPlay
        motion={m}
        offense={m ? (m.towardHome ? awayColor : homeColor) : offense}
        defense={m ? (m.towardHome ? homeColor : awayColor) : offense}
        rest={
          ball !== undefined && (
            <g>
              <g className="live-pulse">
                <ellipse cx={fx(ball)} cy={ballY} rx={1.3} ry={0.8} fill="#8a4a22" stroke="#fff" strokeWidth={0.15} />
                <line x1={fx(ball) - 0.6} x2={fx(ball) + 0.6} y1={ballY} y2={ballY} stroke="#fff" strokeWidth={0.15} />
              </g>
              {towardHome !== undefined && (
                <path d={towardHome ? `M${fx(ball) + 2} ${ballY - 1} l1.5 1 l-1.5 1 z` : `M${fx(ball) - 2} ${ballY - 1} l-1.5 1 l1.5 1 z`} fill="#fff" />
              )}
            </g>
          )
        }
      />
    </Field>
  );
}

// Timeouts left, for the scoreboard — only while the game is on.
export function timeoutsOf(data: FootballState, i: 0 | 1): { left: number; of: number } | undefined {
  const left = data.teams[i]?.timeoutsRemaining;
  return data.state === "in" && left !== undefined ? { left, of: Math.max(left, data.timeoutsPerHalf ?? 3) } : undefined;
}

// The last play's kind as a coloured tag (RUN · left guard · +4).
export function PlayKind({ data }: { data: FootballState }) {
  // only beside the play it describes — not a timeout or "End Game" after it
  const k = data.lastPlayIsMotion === false ? null : playKind(data.motion);
  if (!k) return null;
  return (
    <span className="lv-kind" style={{ background: k.color }}>
      {k.label}
      {k.detail && <small>{k.detail}</small>}
    </span>
  );
}

export default function FootballView({ data, league, leagueColor }: { data: FootballState; league: string; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const possession = data.possessionId === home?.id ? "home" : data.possessionId === away?.id ? "away" : undefined;
  const winPct = data.homeWinPct;
  const teams = [
    { abbr: away?.abbr ?? "", label: teamLabel(away), color: awayColor },
    { abbr: home?.abbr ?? "", label: teamLabel(home), color: homeColor },
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
      centre={<Scoreboard away={{ ...away, color: awayColor, timeouts: timeoutsOf(data, 0) }} home={{ ...home, color: homeColor, timeouts: timeoutsOf(data, 1) }} possession={data.state === "in" ? possession : undefined} />}
      status={data.detail}
    >
      {flash}
      <Surface>
        <FootballSurface data={data} />
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
            <Line primary>
              <PlayKind data={data} />
              {data.lastPlay ?? ""}
            </Line>
          </>
        }
        right={
          (data.driveSummary || winPct !== undefined) && (
            <Side>
              {data.driveSummary && (
                <div className="lv-row">
                  <SideLabel>Drive</SideLabel>
                  <span>{data.driveSummary}</span>
                </div>
              )}
              {winPct !== undefined && (
                <>
                  <div className="lv-row">
                    <SideLabel>Win probability</SideLabel>
                    <span>
                      {teamLabel(away)} {Math.round((1 - winPct) * 100)}% · {teamLabel(home)} {Math.round(winPct * 100)}%
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
