import type { HockeyState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { LiveFrame, Line, Scoreboard, Side, SideLabel, Source, StatTable, Surface } from "../Layout";
import Rink, { rinkPoint } from "../surfaces/Rink";

export default function HockeyView({ data, leagueColor }: { data: HockeyState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const colorOf = (teamId: string) => (teamId === home?.id ? homeColor : awayColor);
  const stat = (teamId: string | undefined, name: string) => data.stats[teamId ?? ""]?.[name];
  const pp = data.powerPlayTeamId ? (data.powerPlayTeamId === home?.id ? home : away) : undefined;
  const lastShot = data.shots.find((s) => s.last);
  const faceoff = data.faceoff;
  const ppLine = (id?: string) => {
    const g = stat(id, "powerPlayGoals");
    const o = stat(id, "powerPlayOpportunities");
    return g !== undefined && o !== undefined ? `${g}/${o}` : undefined;
  };

  return (
    <LiveFrame
      league="NHL"
      leagueColor={leagueColor}
      live={data.state === "in"}
      centre={<Scoreboard away={{ ...away, color: awayColor }} home={{ ...home, color: homeColor }} />}
      status={data.detail}
      footer={
        <>
          <Line primary>{data.lastGoal ? `Last goal: ${data.lastGoal}` : data.recent[0] ?? ""}</Line>
          {data.lastGoal && data.recent[0] && data.recent[0] !== data.lastGoal && <Line>{data.recent[0]}</Line>}
          <Source>ESPN play-by-play · shots drawn at the net each team attacks</Source>
        </>
      }
    >
      <Surface>
        <Rink>
          {/* direction of attack, on the ice above the centre circle */}
          <text x={97} y={24} fontSize={3.6} fontWeight={800} fill={awayColor} textAnchor="end" dominantBaseline="central">
            ← {away?.abbr} shooting
          </text>
          <text x={103} y={24} fontSize={3.6} fontWeight={800} fill={homeColor} textAnchor="start" dominantBaseline="central">
            {home?.abbr} shooting →
          </text>
          {data.shots
            .filter((s) => !s.goal)
            .map((s, i) => {
              const [x, y] = rinkPoint(s.x, s.y);
              return s.blocked ? (
                <circle key={i} cx={x} cy={y} r={1.3} fill="#fff" stroke={colorOf(s.teamId)} strokeWidth={0.6} />
              ) : (
                <circle key={i} cx={x} cy={y} r={1.5} fill={colorOf(s.teamId)} stroke="#fff" strokeWidth={0.3} />
              );
            })}
          {data.shots
            .filter((s) => s.goal)
            .map((s, i) => {
              const [x, y] = rinkPoint(s.x, s.y);
              return (
                <g key={`g${i}`}>
                  <circle cx={x} cy={y} r={3} fill={colorOf(s.teamId)} stroke="#111" strokeWidth={0.5} />
                  <text x={x} y={y} fontSize={3} fontWeight={800} fill="#fff" textAnchor="middle" dominantBaseline="central">
                    G
                  </text>
                </g>
              );
            })}
          {lastShot &&
            (() => {
              const [x, y] = rinkPoint(lastShot.x, lastShot.y);
              // Keyed per shot so a new attempt mounts a fresh ring (restarting
              // its pulse) instead of the old ring sliding across the ice.
              return (
                <circle
                  key={`${data.shots.length}`}
                  cx={x}
                  cy={y}
                  r={lastShot.goal ? 5 : 4}
                  fill="none"
                  stroke={colorOf(lastShot.teamId)}
                  strokeWidth={0.7}
                  className="live-pulse"
                />
              );
            })()}
          {faceoff &&
            (() => {
              const [x, y] = rinkPoint(faceoff.x, faceoff.y);
              return (
                <g>
                  <circle cx={x} cy={y} r={3.4} fill="#111" fillOpacity={0.18} className="live-pulse" />
                  <circle cx={x} cy={y} r={1.7} fill="#111" stroke="#fff" strokeWidth={0.45} />
                </g>
              );
            })()}
        </Rink>
      </Surface>
      <Side>
        {pp && (
          <span className="lv-pill" style={{ background: colorOf(pp.id), color: "#fff" }}>
            Power play · {pp.abbr}
          </span>
        )}
        <StatTable
          teams={[
            { abbr: away?.abbr ?? "", color: awayColor },
            { abbr: home?.abbr ?? "", color: homeColor },
          ]}
          rows={[
            ["Shots on goal", stat(away?.id, "shotsTotal"), stat(home?.id, "shotsTotal")],
            ["Hits", stat(away?.id, "hits"), stat(home?.id, "hits")],
            ["Blocked", stat(away?.id, "blockedShots"), stat(home?.id, "blockedShots")],
            ["Takeaways", stat(away?.id, "takeaways"), stat(home?.id, "takeaways")],
            ["Faceoffs won", stat(away?.id, "faceoffsWon"), stat(home?.id, "faceoffsWon")],
            ["Power plays", ppLine(away?.id), ppLine(home?.id)],
          ]}
        />
        <SideLabel>● shot ○ blocked Ⓖ goal ◯ latest ⬤ faceoff</SideLabel>
      </Side>
    </LiveFrame>
  );
}
