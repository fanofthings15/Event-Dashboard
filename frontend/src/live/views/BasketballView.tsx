import type { BasketballState } from "../liveTypes";
import { teamColors } from "../teamColors";
import { Below, LiveFrame, Line, Scoreboard, Side, StatGrid, Surface, useScoreFlash } from "../Layout";
import Court, { COURT_H, COURT_W, RIM_X } from "../surfaces/Court";
import { BasketballShotPlay } from "../surfaces/PlayAnimations";

export default function BasketballView({ data, leagueColor }: { data: BasketballState; leagueColor: string }) {
  const [away, home] = data.teams;
  const [awayColor, homeColor] = teamColors(away, home);
  const s = (name: string) => [data.stats[away?.id ?? ""]?.[name], data.stats[home?.id ?? ""]?.[name]];
  const teams = [
    { abbr: away?.abbr ?? "", color: awayColor },
    { abbr: home?.abbr ?? "", color: homeColor },
  ];
  // ESPN shot spots are half-court feet: x across the width, y out from the
  // rim (not the baseline). Each team's band marks the basket it defends
  // (away on the left, like the scoreboard), so away shoots at the right
  // basket and home at the left.
  const spot = (shot: { x: number; y: number; teamId: string }): [number, number] => {
    const isHome = shot.teamId === home?.id;
    const cx = isHome ? RIM_X + shot.y : COURT_W - RIM_X - shot.y;
    const cy = isHome ? shot.x : COURT_H - shot.x;
    return [Math.min(COURT_W - 0.5, Math.max(0.5, cx)), Math.min(COURT_H - 0.5, Math.max(0.5, cy))];
  };
  const lastShot = data.shots.at(-1);
  // Baskets come every few seconds, so they get a short edge flash only.
  const flash = useScoreFlash(away && home ? [Number(away.score), Number(home.score)] : undefined, teams, () => ({ banner: null, ms: 1800 }));

  return (
    <LiveFrame
      layout="stack"
      league="NBA"
      leagueColor={leagueColor}
      live={data.state === "in"}
      centre={<Scoreboard away={{ ...away, color: awayColor }} home={{ ...home, color: homeColor }} />}
      status={data.detail}
    >
      {flash}
      <Surface caption={<span>● made · ✕ missed · ◯ latest shot · free throws aren't charted</span>}>
        <Court awayPaint="#b97a45" homePaint="#b97a45" left={teams[0]} right={teams[1]}>
          {data.shots.map((shot, i) => {
            const [cx, cy] = spot(shot);
            const color = shot.teamId === home?.id ? homeColor : awayColor;
            return shot.made ? (
              <circle key={i} cx={cx} cy={cy} r={0.75} fill={color} stroke="#111" strokeWidth={0.15} />
            ) : (
              <path key={i} d={`M${cx - 0.55} ${cy - 0.55} L${cx + 0.55} ${cy + 0.55} M${cx + 0.55} ${cy - 0.55} L${cx - 0.55} ${cy + 0.55}`} stroke={color} strokeWidth={0.28} />
            );
          })}
          {lastShot &&
            (() => {
              const [cx, cy] = spot(lastShot);
              // keyed per shot so each new one restarts the pulse
              return (
                <circle
                  key={data.shots.length}
                  cx={cx}
                  cy={cy}
                  r={2}
                  fill="none"
                  stroke={lastShot.teamId === home?.id ? homeColor : awayColor}
                  strokeWidth={0.35}
                  className="live-pulse"
                />
              );
            })()}
          <BasketballShotPlay
            shot={lastShot ? { id: `${data.shots.length}`, at: spot(lastShot), rimLeft: lastShot.teamId === home?.id, made: lastShot.made } : undefined}
          />
        </Court>
      </Surface>
      <Below
        left={
          <>
            <Line primary>{data.recent[0] ?? ""}</Line>
            {data.recent[1] && <Line>{data.recent[1]}</Line>}
          </>
        }
        right={
          <Side>
            <StatGrid
              teams={teams}
              cols={[
                ["FG", s("fieldGoalsMade-fieldGoalsAttempted")],
                ["3PT", s("threePointFieldGoalsMade-threePointFieldGoalsAttempted")],
                ["FT", s("freeThrowsMade-freeThrowsAttempted")],
                ["Reb", s("totalRebounds")],
                ["Ast", s("assists")],
                ["TO", s("totalTurnovers")],
                ["Fouls", s("fouls")],
              ]}
            />
          </Side>
        }
      />
    </LiveFrame>
  );
}
