import { useEffect, useState } from "react";
import type { HockeyState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { Below, LiveFrame, Line, Scoreboard, Side, StatGrid, Surface, useScoreFlash } from "../Layout";
import Rink, { rinkPoint } from "../surfaces/Rink";
import { HockeyShotPlay } from "../surfaces/PlayAnimations";

// The data has the home team attacking the right-hand net. The display
// mirrors it: each team's colour band marks the goal it defends (like a
// football end zone), and the away team's band is on the left to match the
// scoreboard — so away shoots at the right-hand net, home at the left.
const place = (x: number, y: number) => rinkPoint(-x, -y);

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Counts the power-play clock down locally between polls, starting from the
// server's figure each time a new response arrives.
function usePowerPlayClock(seconds: number | undefined): number | undefined {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (seconds === undefined) return;
    const start = Date.now();
    const id = setInterval(() => setLeft(Math.max(0, seconds - (Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return left;
}

export default function HockeyView({ data, leagueColor }: { data: HockeyState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const colorOf = (teamId: string) => (teamId === home?.id ? homeColor : awayColor);
  const stat = (name: string) => [data.stats[away?.id ?? ""]?.[name], data.stats[home?.id ?? ""]?.[name]];
  const pp = data.powerPlayTeamId ? (data.powerPlayTeamId === home?.id ? home : away) : undefined;
  const ppLeft = usePowerPlayClock(data.powerPlaySecondsLeft);
  const lastShot = data.shots.find((s) => s.last);
  const faceoff = data.faceoff;
  const ppLine = (id?: string) => {
    const g = data.stats[id ?? ""]?.powerPlayGoals;
    const o = data.stats[id ?? ""]?.powerPlayOpportunities;
    return g !== undefined && o !== undefined ? `${g}/${o}` : undefined;
  };
  const teams = [
    { abbr: away?.abbr ?? "", color: awayColor },
    { abbr: home?.abbr ?? "", color: homeColor },
  ];
  const flash = useScoreFlash(away && home ? [Number(away.score), Number(home.score)] : undefined, teams, (_d, team) => ({ banner: `Goal · ${team}`, ms: 9000 }));

  return (
    <LiveFrame
      layout="stack"
      league="NHL"
      leagueColor={leagueColor}
      live={data.state === "in"}
      centre={<Scoreboard away={{ ...away, color: awayColor }} home={{ ...home, color: homeColor }} />}
      status={data.detail}
    >
      {flash}
      <Surface caption={<span>● shot · ○ blocked · Ⓖ goal · ◯ latest shot · ⬤ puck at a faceoff</span>}>
        <Rink left={teams[0]} right={teams[1]}>
          {data.shots
            .filter((s) => !s.goal)
            .map((s, i) => {
              const [x, y] = place(s.x, s.y);
              return s.blocked ? (
                <circle key={i} cx={x} cy={y} r={1.3} fill="#fff" stroke={colorOf(s.teamId)} strokeWidth={0.6} />
              ) : (
                <circle key={i} cx={x} cy={y} r={1.5} fill={colorOf(s.teamId)} stroke="#fff" strokeWidth={0.3} />
              );
            })}
          {data.shots
            .filter((s) => s.goal)
            .map((s, i) => {
              const [x, y] = place(s.x, s.y);
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
              const [x, y] = place(lastShot.x, lastShot.y);
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
              const [x, y] = place(faceoff.x, faceoff.y);
              return (
                <g>
                  <circle cx={x} cy={y} r={3.4} fill="#111" fillOpacity={0.18} className="live-pulse" />
                  <circle cx={x} cy={y} r={1.7} fill="#111" stroke="#fff" strokeWidth={0.45} />
                </g>
              );
            })()}
          <HockeyShotPlay
            shot={
              lastShot
                ? { id: `${data.shots.length}`, at: place(lastShot.x, lastShot.y), goal: lastShot.goal, blocked: lastShot.blocked, missed: lastShot.missed }
                : undefined
            }
          />
        </Rink>
      </Surface>
      <Below
        left={
          <>
            {pp && (
              <span className="lv-pill" style={{ background: colorOf(pp.id), color: "#fff", alignSelf: "flex-start" }}>
                Power play · {pp.abbr}
                {ppLeft !== undefined ? ` · ${fmt(ppLeft)}` : ""}
              </span>
            )}
            <Line primary>{data.lastGoal ? `Last goal: ${data.lastGoal}` : data.recent[0] ?? ""}</Line>
            {data.lastGoal && data.recent[0] && data.recent[0] !== data.lastGoal && <Line>{data.recent[0]}</Line>}
          </>
        }
        right={
          <Side>
            <StatGrid
              teams={teams}
              cols={[
                ["SOG", stat("shotsTotal")],
                ["Hits", stat("hits")],
                ["Blk", stat("blockedShots")],
                ["Tk", stat("takeaways")],
                ["FO", stat("faceoffsWon")],
                ["PP", [ppLine(away?.id), ppLine(home?.id)]],
              ]}
            />
          </Side>
        }
      />
    </LiveFrame>
  );
}
